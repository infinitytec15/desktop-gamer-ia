#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use gf_core::{Plan, PreferenceStore, Snapshot};
use std::sync::{Arc, Mutex};
#[tauri::command]
async fn diagnose(
    state: tauri::State<'_, Mutex<PreferenceStore>>,
) -> Result<gf_core::diagnostics::Report, String> {
    let report = tauri::async_runtime::spawn_blocking(gf_core::diagnostics::diagnose)
        .await
        .map_err(|e| e.to_string())?;
    state
        .lock()
        .map_err(|e| e.to_string())?
        .save_report(&report)
        .map_err(|e| e.to_string())?;
    Ok(report)
}
#[tauri::command]
async fn detect_games() -> Result<Vec<gf_core::integrations::Game>, String> {
    tauri::async_runtime::spawn_blocking(gf_core::integrations::games)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn measure_network() -> Result<Vec<gf_core::integrations::Probe>, String> {
    tauri::async_runtime::spawn_blocking(gf_core::integrations::network)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn obs_status() -> Result<gf_core::integrations::Probe, String> {
    tauri::async_runtime::spawn_blocking(gf_core::integrations::obs_probe)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn monitor_sample(
    state: tauri::State<'_, Arc<Mutex<gf_core::diagnostics::Monitor>>>,
) -> Result<gf_core::diagnostics::Metrics, String> {
    let monitor = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        Ok(monitor.lock().map_err(|e| e.to_string())?.sample())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn list_snapshots(
    state: tauri::State<'_, Mutex<PreferenceStore>>,
) -> Result<Vec<Snapshot>, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .history()
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn restore_snapshot(
    id: String,
    state: tauri::State<'_, Mutex<PreferenceStore>>,
) -> Result<Snapshot, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .restore_id(&id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn apply_preferences(
    plan: Plan,
    state: tauri::State<'_, Mutex<PreferenceStore>>,
) -> Result<Snapshot, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .apply(plan)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn get_snapshot(
    state: tauri::State<'_, Mutex<PreferenceStore>>,
) -> Result<Option<Snapshot>, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .snapshot()
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn restore_last(state: tauri::State<'_, Mutex<PreferenceStore>>) -> Result<Snapshot, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .restore()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_secret(name: String, value: String) -> Result<(), String> {
    if !cfg!(debug_assertions) && ["anthropic", "openai"].contains(&name.as_str()) {
        return Err("BYOK restrito ao beta".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::secrets::save(&name, &value).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn secret_status() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(gf_core::secrets::status)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn remove_secret(name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::secrets::remove(&name).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
struct AiContext(Mutex<Option<serde_json::Value>>);
#[tauri::command]
async fn preview_ai(
    goal: String,
    state: tauri::State<'_, AiContext>,
) -> Result<serde_json::Value, String> {
    if !cfg!(windows) {
        return Err("O planejamento de ajustes de sistema desta versão é específico do Windows. Use as ferramentas compatíveis com seu Mac.".into());
    }
    let context = tauri::async_runtime::spawn_blocking(move || {
        gf_core::ai::context(&gf_core::diagnostics::diagnose(), &goal).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    *state.0.lock().map_err(|e| e.to_string())? = Some(context.clone());
    Ok(context)
}
#[tauri::command]
async fn generate_plan(
    allow_fallback: bool,
    options: Option<serde_json::Value>,
    state: tauri::State<'_, AiContext>,
) -> Result<gf_core::automation::OptimizationPlan, String> {
    if !cfg!(windows) {
        return Err("A análise de ajustes Windows não está disponível no macOS. Nenhum crédito foi consumido.".into());
    }
    let context = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Revise primeiro o diagnóstico que será enviado à IA")?;
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::cloud::generate(
            &context,
            allow_fallback,
            &options.unwrap_or_else(|| serde_json::json!({})),
        )
        .and_then(|p| {
            PreferenceStore::new(gf_core::data_dir()).record_plan(&p)?;
            Ok(p)
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn offline_plan(goal: Option<String>) -> Result<gf_core::automation::OptimizationPlan, String> {
    let p = gf_core::automation::OptimizationPlan::offline_for(goal.as_deref())
        .map_err(|e| e.to_string())?;
    PreferenceStore::new(gf_core::data_dir())
        .record_plan(&p)
        .map_err(|e| e.to_string())?;
    Ok(p)
}
#[tauri::command]
async fn system_checks() -> Result<Vec<gf_core::system::SystemCheck>, String> {
    tauri::async_runtime::spawn_blocking(gf_core::system::checks)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn prepare_system(
    actions: Vec<gf_core::automation::SystemAction>,
) -> Result<gf_core::automation::Operation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::cloud::require("system_optimize").map_err(|e| e.to_string())?;
        gf_core::system::prepare(&PreferenceStore::new(gf_core::data_dir()), actions)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn apply_system(id: String) -> Result<gf_core::automation::Operation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::cloud::require("system_optimize").map_err(|e| e.to_string())?;
        gf_core::system::launch(&PreferenceStore::new(gf_core::data_dir()), &id, false)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn cancel_system(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::system::cancel(&PreferenceStore::new(gf_core::data_dir()), &id)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn operation_history() -> Result<Vec<gf_core::automation::Operation>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        PreferenceStore::new(gf_core::data_dir())
            .operations()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn undo_operation(id: String) -> Result<gf_core::automation::Operation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = PreferenceStore::new(gf_core::data_dir());
        gf_core::system::undo(&store, &id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn obs_connect() -> Result<gf_core::obs::ObsState, String> {
    tauri::async_runtime::spawn_blocking(|| gf_core::obs::status().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn obs_configure(
    video: gf_core::automation::StreamVideo,
    target: gf_core::obs::StreamTarget,
) -> Result<gf_core::automation::Operation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::cloud::require("obs_configure").map_err(|e| e.to_string())?;
        gf_core::obs::apply(&PreferenceStore::new(gf_core::data_dir()), video, target)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn open_obs() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| gf_core::obs::open_app().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn list_programs() -> Result<gf_core::inventory::Inventory, String> {
    tauri::async_runtime::spawn_blocking(gf_core::inventory::scan)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn create_workflow(
    brief: gf_core::workflow::WorkBrief,
) -> Result<gf_core::automation::Operation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::workflow::create(&PreferenceStore::new(gf_core::data_dir()), brief)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn advance_workflow(
    id: String,
    to: gf_core::workflow::WorkState,
    operation_id: Option<String>,
) -> Result<gf_core::automation::Operation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::workflow::transition(
            &PreferenceStore::new(gf_core::data_dir()),
            &id,
            to,
            operation_id,
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn obs_auto_connect() -> Result<gf_core::obs::ObsState, String> {
    tauri::async_runtime::spawn_blocking(|| gf_core::obs::auto_connect().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn license_status() -> Result<gf_core::cloud::LicenseStatus, String> {
    tauri::async_runtime::spawn_blocking(gf_core::cloud::status)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn license_activate(key: String) -> Result<gf_core::cloud::LicenseStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::cloud::activate(&key).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn license_deactivate() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| gf_core::cloud::deactivate().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn estimate_ai(input: serde_json::Value) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::cloud::estimate(&input).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn printing_ai(input: serde_json::Value) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::cloud::printing(&input).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_print_artifact(name: String, base64_data: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        gf_core::printing::save(
            &PreferenceStore::new(gf_core::data_dir()),
            &name,
            &base64_data,
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).is_some_and(|s| s == "--system-helper") {
        let result = match (args.get(2), args.get(3)) {
            (Some(id), Some(mode)) if mode == "apply" || mode == "restore" => {
                gf_core::system::helper(
                    &PreferenceStore::new(gf_core::data_dir()),
                    id,
                    mode == "restore",
                )
                .map(|_| ())
            }
            _ => Err(gf_core::Error::Invalid("Argumentos inválidos".into())),
        };
        if let (Err(error), Some(id)) = (&result, args.get(2)) {
            let _ = gf_core::system::record_failure(
                &PreferenceStore::new(gf_core::data_dir()),
                id,
                error,
            );
        }
        std::process::exit(if result.is_ok() { 0 } else { 1 });
    }

    if let Some(kind) = match args.get(1).map(|s| s.as_str()) {
        Some("--restore-system-last") => Some("system"),
        Some("--restore-obs-last") => Some("obs"),
        _ => None,
    } {
        let store = PreferenceStore::new(gf_core::data_dir());
        let result = store.operations().and_then(|ops| {
            let op = ops
                .into_iter()
                .find(|o| {
                    o.kind == kind
                        && ["applied", "pending", "recovery_required"].contains(&o.status.as_str())
                })
                .ok_or_else(|| gf_core::Error::Invalid("Nenhuma operação restaurável".into()))?;
            gf_core::system::undo(&store, &op.id)
        });
        std::process::exit(if result.is_ok() { 0 } else { 1 });
    }
    if std::env::args().any(|a| a == "--restore-last") {
        if let Err(e) = PreferenceStore::new(gf_core::data_dir()).restore() {
            eprintln!("{e}");
            std::process::exit(1)
        }
        return;
    }
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(AiContext(Mutex::new(None)))
        .manage(Arc::new(Mutex::new(
            gf_core::diagnostics::Monitor::default(),
        )))
        .manage(Mutex::new(PreferenceStore::new(gf_core::data_dir())))
        .invoke_handler(tauri::generate_handler![
            system_checks,
            printing_ai,
            estimate_ai,
            save_print_artifact,
            license_status,
            license_activate,
            license_deactivate,
            list_programs,
            create_workflow,
            advance_workflow,
            obs_auto_connect,
            save_secret,
            secret_status,
            remove_secret,
            preview_ai,
            generate_plan,
            offline_plan,
            prepare_system,
            apply_system,
            cancel_system,
            operation_history,
            undo_operation,
            open_obs,
            obs_connect,
            obs_configure,
            diagnose,
            detect_games,
            measure_network,
            obs_status,
            monitor_sample,
            list_snapshots,
            restore_snapshot,
            apply_preferences,
            get_snapshot,
            restore_last
        ])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        eprintln!("Falha ao iniciar GameForge: {e}");
        std::process::exit(1);
    }
}
