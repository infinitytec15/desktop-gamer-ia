pub mod ai;
pub mod automation;
pub mod cloud;
pub mod diagnostics;
pub mod integrations;
pub mod inventory;
pub mod obs;
pub mod printing;
pub mod secrets;
pub mod system;
pub mod telemetry;
pub mod workflow;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::PathBuf};
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Falha de armazenamento: {0}")]
    Io(#[from] std::io::Error),
    #[error("Dados inválidos: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Plano inválido: {0}")]
    Invalid(String),
    #[error("Falha no banco: {0}")]
    Database(#[from] rusqlite::Error),
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    SetPreference { key: String, value: bool },
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct Plan {
    pub steps: Vec<Action>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct Snapshot {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub created_at: String,
    pub before: BTreeMap<String, bool>,
    pub after: BTreeMap<String, bool>,
    pub status: String,
}
/// First adapter changes only GameForge's own preferences, never OS settings.
/// Production OS adapters must implement this same durable pre-write journal protocol.
pub struct PreferenceStore {
    dir: PathBuf,
}
impl PreferenceStore {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }
    pub fn read(&self) -> Result<BTreeMap<String, bool>, Error> {
        let p = self.dir.join("preferences.json");
        if !p.exists() {
            return Ok(BTreeMap::new());
        }
        Ok(serde_json::from_slice(&fs::read(p)?)?)
    }
    pub fn validate(plan: &Plan) -> Result<(), Error> {
        if plan.steps.is_empty() || plan.steps.len() > 3 {
            return Err(Error::Invalid("Selecione de 1 a 3 preferências".into()));
        }
        let mut seen = std::collections::BTreeSet::new();
        for Action::SetPreference { key, .. } in &plan.steps {
            if !["reduced_motion", "monitor_enabled", "offline_first"].contains(&key.as_str())
                || !seen.insert(key)
            {
                return Err(Error::Invalid(
                    "Preferência desconhecida ou duplicada".into(),
                ));
            }
        }
        Ok(())
    }
    pub fn apply(&self, plan: Plan) -> Result<Snapshot, Error> {
        let _lock = self.acquire_lock()?;
        Self::validate(&plan)?;
        if let Some(s) = self.snapshot()? {
            if s.status == "pending" {
                return Err(Error::Invalid(
                    "Recupere a aplicação pendente antes de continuar".into(),
                ));
            }
        }
        let before = self.read()?;
        let mut after = before.clone();
        for Action::SetPreference { key, value } in plan.steps {
            after.insert(key, value);
        }
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| Error::Invalid(e.to_string()))?
            .as_nanos()
            .to_string();
        let mut s = Snapshot {
            id: stamp.clone(),
            created_at: stamp,
            before,
            after: after.clone(),
            status: "pending".into(),
        };
        self.write("snapshot.json", &s)?; // durable journal before any change
        self.write("preferences.json", &after)?;
        s.status = "applied".into();
        self.write("snapshot.json", &s)?;
        Ok(s)
    }
    fn connection(&self) -> Result<rusqlite::Connection, Error> {
        fs::create_dir_all(&self.dir)?;
        let c = rusqlite::Connection::open(self.dir.join("gameforge.db"))?;
        c.busy_timeout(std::time::Duration::from_secs(3))?;
        let version: u32 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 3 {
            return Err(Error::Invalid(
                "Banco criado por uma versão mais recente do aplicativo".into(),
            ));
        }
        c.execute_batch("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS snapshots (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS system_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, report_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations (seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL); PRAGMA user_version=3;")?;
        Ok(c)
    }
    pub fn save_report(&self, report: &diagnostics::Report) -> Result<(), Error> {
        let mut c = self.connection()?;
        let tx = c.transaction()?;
        tx.execute(
            "INSERT INTO system_reports(report_json) VALUES(?1)",
            [serde_json::to_string(report)?],
        )?;
        tx.execute("DELETE FROM system_reports WHERE id NOT IN (SELECT id FROM system_reports ORDER BY id DESC LIMIT 20)",[])?;
        tx.commit()?;
        Ok(())
    }
    fn acquire_lock(&self) -> Result<fs::File, Error> {
        fs::create_dir_all(&self.dir)?;
        let f = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.dir.join("execution.lock"))?;
        f.try_lock()
            .map_err(|_| Error::Invalid("Outra operação está em execução".into()))?;
        Ok(f)
    }
    pub fn history(&self) -> Result<Vec<Snapshot>, Error> {
        let c = self.connection()?;
        let mut stmt = c.prepare("SELECT data FROM snapshots ORDER BY seq DESC LIMIT 100")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(serde_json::from_str(&r?)?);
        }
        Ok(out)
    }
    pub fn snapshot(&self) -> Result<Option<Snapshot>, Error> {
        if let Some(s) = self.history()?.into_iter().next() {
            return Ok(Some(s));
        }
        let p = self.dir.join("snapshot.json");
        if p.exists() {
            let mut s: Snapshot = serde_json::from_slice(&fs::read(p)?)?;
            if s.id.is_empty() {
                s.id = "legacy".into();
            }
            self.write("snapshot.json", &s)?;
            return Ok(Some(s));
        }
        Ok(None)
    }
    pub fn restore_id(&self, id: &str) -> Result<Snapshot, Error> {
        let _lock = self.acquire_lock()?;
        if self
            .snapshot()?
            .is_some_and(|s| s.status == "pending" && s.id != id)
        {
            return Err(Error::Invalid(
                "Recupere o snapshot pendente primeiro".into(),
            ));
        }
        let mut s = self
            .history()?
            .into_iter()
            .find(|s| s.id == id)
            .ok_or_else(|| Error::Invalid("Snapshot não encontrado".into()))?;
        self.restore_snapshot(&mut s)?;
        Ok(s)
    }
    fn restore_snapshot(&self, s: &mut Snapshot) -> Result<(), Error> {
        let current = self.read()?;
        if current != s.after && current != s.before {
            return Err(Error::Invalid("Conflito: as preferências atuais não correspondem ao snapshot. Restauração bloqueada para preservar dados.".into()));
        }
        self.write("preferences.json", &s.before)?;
        s.status = "restored".into();
        self.write("snapshot.json", s)
    }
    pub fn restore(&self) -> Result<Snapshot, Error> {
        let _lock = self.acquire_lock()?;
        let mut s = self
            .snapshot()?
            .ok_or_else(|| Error::Invalid("Não há snapshot".into()))?;
        self.restore_snapshot(&mut s)?;
        Ok(s)
    }
    fn write(&self, name: &str, value: &impl Serialize) -> Result<(), Error> {
        if name == "snapshot.json" {
            let mut snapshot: Snapshot = serde_json::from_value(serde_json::to_value(value)?)?;
            if snapshot.id.is_empty() {
                snapshot.id = "legacy".into();
            }
            let c = self.connection()?;
            c.execute("INSERT INTO snapshots(id,data) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",rusqlite::params![snapshot.id,serde_json::to_string(&snapshot)?])?;
            return Ok(());
        }
        fs::create_dir_all(&self.dir)?;
        let p = self.dir.join(name);
        let tmp = self.dir.join(format!("{name}.tmp"));
        let mut f = fs::File::create(&tmp)?;
        use std::io::Write;
        f.write_all(&serde_json::to_vec_pretty(value)?)?;
        f.sync_all()?;
        drop(f);
        // On Windows rename over an existing file is supported by std's implementation.
        fs::rename(tmp, p)?;
        Ok(())
    }
}
pub fn data_dir() -> PathBuf {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::{
            System::Com::CoTaskMemFree,
            UI::Shell::{FOLDERID_RoamingAppData, SHGetKnownFolderPath},
        };
        let mut ptr = std::ptr::null_mut();
        if SHGetKnownFolderPath(&FOLDERID_RoamingAppData, 0, std::ptr::null_mut(), &mut ptr) >= 0
            && !ptr.is_null()
        {
            let mut len = 0;
            while *ptr.add(len) != 0 {
                len += 1;
            }
            let root = PathBuf::from(String::from_utf16_lossy(std::slice::from_raw_parts(
                ptr, len,
            )));
            CoTaskMemFree(ptr.cast());
            return root.join("GameForge");
        }
        // Never use an untrusted environment path in an elevated process.
        PathBuf::from(r"\\.\NUL\GameForge")
    }
    #[cfg(not(windows))]
    std::env::var_os("HOME")
        .map(|h| std::path::Path::new(&h).join("Library/Application Support/GameForge"))
        .unwrap_or_else(|| std::env::temp_dir().join("GameForge"))
}
#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> PreferenceStore {
        let n = uuid::Uuid::new_v4();
        PreferenceStore::new(std::env::temp_dir().join(format!("gf-test-{n}")))
    }

    #[test]
    fn archives_and_restores_multiple_snapshots() {
        let s = store();
        let first = s
            .apply(Plan {
                steps: vec![Action::SetPreference {
                    key: "offline_first".into(),
                    value: true,
                }],
            })
            .expect("first");
        let second = s
            .apply(Plan {
                steps: vec![Action::SetPreference {
                    key: "monitor_enabled".into(),
                    value: true,
                }],
            })
            .expect("second");
        assert_ne!(first.id, second.id);
        assert_eq!(s.history().expect("history").len(), 2);
        assert!(s.restore_id(&first.id).is_err());
        s.restore_id(&second.id).expect("second undo");
        s.restore_id(&first.id).expect("first undo");
        assert!(s.read().expect("read").is_empty());
        fs::remove_dir_all(s.dir).expect("cleanup");
    }
    #[test]
    fn migrates_legacy_json_without_losing_snapshot() {
        let s = store();
        fs::create_dir_all(&s.dir).expect("dir");
        fs::write(
            s.dir.join("snapshot.json"),
            r#"{"before":{},"after":{"offline_first":true},"status":"applied"}"#,
        )
        .expect("legacy");
        s.write(
            "preferences.json",
            &BTreeMap::from([("offline_first", true)]),
        )
        .expect("state");
        assert_eq!(s.snapshot().expect("migrate").expect("exists").id, "legacy");
        s.restore().expect("restore legacy");
        assert!(s.read().expect("read").is_empty());
        fs::remove_dir_all(s.dir).expect("cleanup");
    }
    #[test]
    fn locks_out_another_process_and_rejects_duplicate_actions() {
        let s = store();
        let lock = s.acquire_lock().expect("lock");
        assert!(s
            .apply(Plan {
                steps: vec![Action::SetPreference {
                    key: "offline_first".into(),
                    value: true
                }]
            })
            .is_err());
        drop(lock);
        assert!(PreferenceStore::validate(&Plan {
            steps: vec![
                Action::SetPreference {
                    key: "offline_first".into(),
                    value: true
                },
                Action::SetPreference {
                    key: "offline_first".into(),
                    value: false
                }
            ]
        })
        .is_err());
        fs::remove_dir_all(s.dir).expect("cleanup");
    }
    #[test]
    fn recovers_pending_journal_after_restart() {
        let s = store();
        let pending = Snapshot {
            id: "interrupted".into(),
            created_at: "0".into(),
            before: BTreeMap::new(),
            after: BTreeMap::from([("offline_first".into(), true)]),
            status: "pending".into(),
        };
        s.write("snapshot.json", &pending).expect("journal");
        s.write("preferences.json", &pending.after)
            .expect("interrupted write");
        let reopened = PreferenceStore::new(s.dir.clone());
        assert!(reopened
            .apply(Plan {
                steps: vec![Action::SetPreference {
                    key: "monitor_enabled".into(),
                    value: true
                }]
            })
            .is_err());
        reopened.restore().expect("recover");
        assert!(reopened.read().expect("read").is_empty());
        fs::remove_dir_all(s.dir).expect("cleanup");
    }
    #[test]
    fn roundtrip_and_snapshot() {
        let s = store();
        let before = s.read().expect("read");
        s.apply(Plan {
            steps: vec![Action::SetPreference {
                key: "offline_first".into(),
                value: true,
            }],
        })
        .expect("apply");
        assert_eq!(s.read().expect("read").get("offline_first"), Some(&true));
        s.restore().expect("restore");
        assert_eq!(s.read().expect("read"), before);
        fs::remove_dir_all(s.dir).expect("cleanup");
    }
    #[test]
    fn rejects_arbitrary_keys() {
        assert!(PreferenceStore::validate(&Plan {
            steps: vec![Action::SetPreference {
                key: "disable_antivirus".into(),
                value: true
            }]
        })
        .is_err());
    }
    #[test]
    fn refuses_external_changes() {
        let s = store();
        s.apply(Plan {
            steps: vec![Action::SetPreference {
                key: "offline_first".into(),
                value: true,
            }],
        })
        .expect("apply");
        s.write(
            "preferences.json",
            &BTreeMap::from([("monitor_enabled", true)]),
        )
        .expect("external write");
        assert!(s.restore().is_err());
        fs::remove_dir_all(s.dir).expect("cleanup");
    }
}
