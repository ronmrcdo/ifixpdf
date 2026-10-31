#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

/// Writes `<path>.ifixpdf-tmp`, flushes it to disk, then renames it over `path`, so a failed save never leaves a half-written file.
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".ifixpdf-tmp");
    let tmp = PathBuf::from(tmp);
    let result = fs::File::create(&tmp)
        .and_then(|mut file| {
            file.write_all(bytes)?;
            file.sync_all()
        })
        .and_then(|()| fs::rename(&tmp, path));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// Decodes `encodeURIComponent` output; `None` on a malformed escape or non-UTF-8 result.
fn decode_uri(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'%' {
            out.push(bytes[i]);
            i += 1;
            continue;
        }
        let hex = bytes
            .get(i + 1..i + 3)
            .filter(|h| h.iter().all(u8::is_ascii_hexdigit))?;
        out.push(u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()?);
        i += 3;
    }
    String::from_utf8(out).ok()
}

/// The dialog filter per save kind; mirrors SAVE_KINDS in src/platform/types.ts.
fn save_filter(kind: &str) -> Result<(&'static str, &'static str), String> {
    match kind {
        "pdf" => Ok(("PDF document", "pdf")),
        "zip" => Ok(("ZIP archive", "zip")),
        _ => Err(format!("unknown save kind: {kind}")),
    }
}

/// Save as: the body is the file bytes; the `name` (URI-encoded) and `kind` headers pick the suggested name and filter.
/// Returns the chosen path, or `None` when the dialog is cancelled. Async: the blocking dialog must not run on the main thread.
#[tauri::command]
async fn save_as(window: tauri::Window, request: Request<'_>) -> Result<Option<String>, String> {
    // shortcut: raw body only (the custom-protocol IPC); the postMessage fallback sends a JSON array and is refused, accept it if Windows shows that fallback.
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("save_as expects raw bytes".into());
    };
    let header = |key: &str| {
        request
            .headers()
            .get(key)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| format!("missing {key} header"))
    };
    let name = decode_uri(header("name")?).ok_or("invalid name header")?;
    let (label, ext) = save_filter(header("kind")?)?;
    let Some(picked) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(name)
        .add_filter(label, &[ext])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    write_atomic(&path, bytes).map_err(|e| e.to_string())?;
    // Read scope only (the webview has no write permission): recents reopen the saved file, as after the dialog plugin's save.
    window
        .fs_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // After fs: it restores and saves the fs scope (picked and dropped files) across restarts.
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_as])
        .run(tauri::generate_context!())
        .expect("iFixPDF could not start");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ifixpdf-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn entries(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn write_atomic_creates_file() {
        let dir = temp_dir("creates");
        let path = dir.join("x.pdf");
        write_atomic(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(entries(&dir), ["x.pdf"]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn write_atomic_replaces_existing() {
        let dir = temp_dir("replaces");
        let path = dir.join("x.pdf");
        fs::write(&path, b"old contents").unwrap();
        write_atomic(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(entries(&dir), ["x.pdf"]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn write_atomic_leaves_no_temp_on_error() {
        let dir = temp_dir("error");
        assert!(write_atomic(&dir.join("missing").join("x.pdf"), b"new").is_err());
        assert_eq!(entries(&dir), Vec::<String>::new());
        // The temp file is written but the rename fails (the target is a folder): the temp is removed.
        fs::create_dir(dir.join("x.pdf")).unwrap();
        assert!(write_atomic(&dir.join("x.pdf"), b"new").is_err());
        assert_eq!(entries(&dir), ["x.pdf"]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn decode_uri_decodes_percent_escapes() {
        assert_eq!(
            decode_uri("Report%20%E2%80%93%20pages%201.pdf").as_deref(),
            Some("Report – pages 1.pdf")
        );
        assert_eq!(decode_uri("plain.pdf").as_deref(), Some("plain.pdf"));
        assert_eq!(decode_uri("").as_deref(), Some(""));
        assert_eq!(decode_uri("bad%2"), None);
        assert_eq!(decode_uri("bad%+1"), None);
        assert_eq!(decode_uri("bad%zz"), None);
        assert_eq!(decode_uri("%FF"), None); // not UTF-8
    }

    #[test]
    fn save_filter_maps_known_kinds_only() {
        assert_eq!(save_filter("pdf"), Ok(("PDF document", "pdf")));
        assert_eq!(save_filter("zip"), Ok(("ZIP archive", "zip")));
        assert!(save_filter("exe").is_err());
        assert!(save_filter("").is_err());
    }
}
