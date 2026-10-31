fn main() {
    // An app manifest turns on the ACL for app commands: save_as runs only where a capability grants allow-save-as.
    let manifest = tauri_build::AppManifest::new().commands(&["save_as"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to run tauri-build");
}
