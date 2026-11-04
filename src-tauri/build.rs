fn main() {
    // An app manifest turns on the ACL for app commands: app commands run only where a capability grants allow-<command> (allow-save-as, allow-is-store-install).
    let manifest = tauri_build::AppManifest::new().commands(&["save_as", "is_store_install"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to run tauri-build");
}
