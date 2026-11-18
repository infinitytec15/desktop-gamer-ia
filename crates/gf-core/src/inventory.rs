use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub source: String,
    pub adapter: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct Inventory {
    pub apps: Vec<InstalledApp>,
    pub warnings: Vec<String>,
}
fn adapter(name: &str) -> String {
    let n = name.to_lowercase();
    if n.contains("obs studio") {
        "obs"
    } else if [
        "bambu studio",
        "bambustudio",
        "orcaslicer",
        "orca-flashforge",
        "flashprint",
        "creality print",
        "elegooslicer",
        "chitubox",
        "lychee",
        "photon workshop",
        "prusaslicer",
        "superslicer",
    ]
    .iter()
    .any(|name| n.contains(name))
    {
        "printing"
    } else if n.contains("discord") {
        "discord"
    } else {
        "guided"
    }
    .into()
}
fn make(id: &str, name: String, version: String, publisher: String, source: &str) -> InstalledApp {
    InstalledApp {
        id: format!("{:x}", Sha256::digest(id.as_bytes())),
        adapter: adapter(&name),
        name,
        version,
        publisher,
        source: source.into(),
    }
}
pub fn scan() -> Inventory {
    let mut apps = Vec::new();
    let mut warnings = Vec::new();
    #[cfg(windows)]
    {
        use winreg::{enums::*, RegKey};
        for (hive, tag) in [(HKEY_LOCAL_MACHINE, "machine"), (HKEY_CURRENT_USER, "user")] {
            for (view, label) in [(KEY_WOW64_64KEY, "64"), (KEY_WOW64_32KEY, "32")] {
                let key = match RegKey::predef(hive).open_subkey_with_flags(
                    r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
                    KEY_READ | view,
                ) {
                    Ok(k) => k,
                    Err(e) => {
                        if e.kind() != std::io::ErrorKind::NotFound {
                            warnings.push(format!("Não foi possível ler registro {tag}/{label}"));
                        }
                        continue;
                    }
                };
                for name in key.enum_keys().filter_map(Result::ok) {
                    if let Ok(item) = key.open_subkey(&name) {
                        if item.get_value::<u32, _>("SystemComponent").unwrap_or(0) == 1 {
                            continue;
                        }
                        if let Ok(display) = item.get_value::<String, _>("DisplayName") {
                            if !display.trim().is_empty() {
                                apps.push(make(
                                    &format!("{tag}/{label}/{name}"),
                                    display,
                                    item.get_value("DisplayVersion").unwrap_or_default(),
                                    item.get_value("Publisher").unwrap_or_default(),
                                    "Registro Windows",
                                ));
                            }
                        }
                    }
                }
            }
        }
        warnings.push("Inventário dos programas registrados em Instalar/Remover Programas. Apps MSIX/Store, portáteis e instalações não registradas podem não aparecer.".into());
    }
    #[cfg(target_os = "macos")]
    {
        for root in [
            std::path::PathBuf::from("/Applications"),
            std::env::var_os("HOME")
                .map(std::path::PathBuf::from)
                .unwrap_or_default()
                .join("Applications"),
        ] {
            if let Ok(entries) = std::fs::read_dir(root) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().is_some_and(|e| e == "app") {
                        let name = p.file_stem().unwrap_or_default().to_string_lossy().into();
                        apps.push(make(
                            &p.to_string_lossy(),
                            name,
                            String::new(),
                            String::new(),
                            "Applications",
                        ));
                    }
                }
            }
        }
        warnings
            .push("Inventário de Applications; apps em outras pastas podem não aparecer.".into());
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    warnings.push("Plataforma ainda sem inventário implementado".into());
    apps.sort_by_key(|a| (a.name.to_lowercase(), a.version.clone()));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name) && a.version == b.version);
    Inventory { apps, warnings }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn adapters_never_imply_arbitrary_automation() {
        assert_eq!(adapter("OBS Studio"), "obs");
        assert_eq!(adapter("Bambu Studio"), "printing");
        assert_eq!(adapter("CHITUBOX Basic"), "printing");
        assert_eq!(adapter("Unknown editor"), "guided");
        let app = make(
            "private-local-path",
            "Example".into(),
            "1".into(),
            "Publisher".into(),
            "fixture",
        );
        assert!(!app.id.contains("private"));
        assert_eq!(app.id.len(), 64);
    }
}
