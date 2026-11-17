use serde::{Deserialize, Serialize};
use std::{
    fs,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct Game {
    pub id: String,
    pub name: String,
    pub store: String,
    pub installed: bool,
}
/// Reads only manifest fields; no game executable, protected file or anti-cheat is opened.
pub fn quoted_values(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c == '"' {
            let mut value = String::new();
            while let Some(c) = chars.next() {
                match c {
                    '"' => break,
                    '\\' => {
                        if let Some(next) = chars.next() {
                            value.push(next);
                        }
                    }
                    _ => value.push(c),
                }
            }
            out.push(value);
        }
    }
    out
}
fn field(values: &[String], key: &str) -> Option<String> {
    values
        .windows(2)
        .find(|w| w[0] == key)
        .map(|w| w[1].clone())
}
fn scan_steam(root: &Path) -> Vec<Game> {
    let mut libraries = vec![root.to_path_buf()];
    if let Ok(text) = fs::read_to_string(root.join("steamapps/libraryfolders.vdf")) {
        let v = quoted_values(&text);
        for pair in v.windows(2) {
            if pair[0] == "path" {
                let p = PathBuf::from(&pair[1]);
                if !libraries.contains(&p) {
                    libraries.push(p);
                }
            }
        }
    }
    let mut games = Vec::new();
    for lib in libraries {
        if let Ok(entries) = fs::read_dir(lib.join("steamapps")) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().is_some_and(|e| e == "acf") {
                    if let Ok(text) = fs::read_to_string(p) {
                        let v = quoted_values(&text);
                        if let (Some(id), Some(name), Some(dir)) = (
                            field(&v, "appid"),
                            field(&v, "name"),
                            field(&v, "installdir"),
                        ) {
                            games.push(Game {
                                id: format!("steam:{id}"),
                                name,
                                store: "Steam".into(),
                                installed: lib.join("steamapps/common").join(dir).is_dir(),
                            });
                        }
                    }
                }
            }
        }
    }
    games
}
pub fn games() -> Vec<Game> {
    let mut out = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Some(p) = std::env::var_os("ProgramFiles(x86)") {
            out.extend(scan_steam(&PathBuf::from(p).join("Steam")));
        }
        if let Some(p) = std::env::var_os("PROGRAMDATA") {
            if let Ok(entries) =
                fs::read_dir(PathBuf::from(p).join("Epic/EpicGamesLauncher/Data/Manifests"))
            {
                for entry in entries.flatten() {
                    if let Ok(text) = fs::read_to_string(entry.path()) {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let (Some(name), Some(id), Some(location)) = (
                                v["DisplayName"].as_str(),
                                v["AppName"].as_str(),
                                v["InstallLocation"].as_str(),
                            ) {
                                out.push(Game {
                                    id: format!("epic:{id}"),
                                    name: name.into(),
                                    store: "Epic".into(),
                                    installed: Path::new(location).is_dir(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(p) = std::env::var_os("HOME") {
            out.extend(scan_steam(
                &PathBuf::from(p).join("Library/Application Support/Steam"),
            ));
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out.dedup_by(|a, b| a.id == b.id);
    out
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct Probe {
    pub name: String,
    pub connected: bool,
    pub connect_ms: Option<f64>,
    pub description: String,
}
pub fn network() -> Vec<Probe> {
    [
        ("Cloudflare", "1.1.1.1:443"),
        ("Google", "8.8.8.8:443"),
        ("Quad9", "9.9.9.9:443"),
    ]
    .iter()
    .filter_map(|(name, endpoint)| {
        let addr: SocketAddr = endpoint.parse().ok()?;
        let start = Instant::now();
        let ok = TcpStream::connect_timeout(&addr, Duration::from_millis(1200)).is_ok();
        Some(Probe {
            name: name.to_string(),
            connected: ok,
            connect_ms: if ok {
                Some(start.elapsed().as_secs_f64() * 1000.)
            } else {
                None
            },
            description:
                "Tempo de conexão TCP/443. Não mede DNS, ping de jogo, perda, jitter ou upload."
                    .into(),
        })
    })
    .collect()
}
pub fn obs_probe() -> Probe {
    let connected = TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], 4455)),
        Duration::from_millis(500),
    )
    .is_ok();
    Probe{name:"OBS · porta local 4455".into(),connected,connect_ms:None,description:"Uma porta aberta não confirma autenticação ou identidade do servidor. Use as instruções de conexão; nenhuma configuração do OBS foi alterada.".into()}
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manifest_parsing() {
        let v = quoted_values(
            r#""AppState" { "appid" "730" "name" "Counter-Strike 2" "installdir" "Counter-Strike Global Offensive" }"#,
        );
        assert_eq!(field(&v, "appid"), Some("730".into()));
        assert_eq!(field(&v, "name"), Some("Counter-Strike 2".into()));
    }
    #[test]
    fn escaped_paths() {
        let v = quoted_values(r#""path" "D:\\SteamLibrary""#);
        assert_eq!(field(&v, "path"), Some("D:\\SteamLibrary".into()));
    }
}
