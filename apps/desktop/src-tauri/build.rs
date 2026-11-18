fn main() {
    println!("cargo:rerun-if-env-changed=GAMEFORGE_API_URL");
    println!("cargo:rerun-if-env-changed=GAMEFORGE_LICENSE_PUBLIC_KEY_B64");
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "printing_ai",
            "save_print_artifact",
            "license_status",
            "license_activate",
            "license_deactivate",
            "list_programs",
            "create_workflow",
            "advance_workflow",
            "obs_auto_connect",
            "save_secret",
            "secret_status",
            "remove_secret",
            "preview_ai",
            "generate_plan",
            "offline_plan",
            "prepare_system",
            "apply_system",
            "cancel_system",
            "operation_history",
            "undo_operation",
            "open_obs",
            "obs_connect",
            "obs_configure",
            "diagnose",
            "apply_preferences",
            "get_snapshot",
            "restore_last",
            "detect_games",
            "measure_network",
            "obs_status",
            "monitor_sample",
            "list_snapshots",
            "restore_snapshot",
        ]));
    if let Err(error) = tauri_build::try_build(attributes) {
        eprintln!("Falha ao preparar permissões: {error}");
        std::process::exit(1);
    }
}
