use crate::{
    automation::{stamp, Operation, StreamVideo},
    secrets, Error, PreferenceStore,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    net::{SocketAddr, TcpStream},
    time::{Duration, Instant},
};
use ts_rs::TS;
use tungstenite::{Message, WebSocket};
fn auth(password: &str, salt: &str, challenge: &str) -> String {
    let secret = STANDARD.encode(Sha256::digest(format!("{password}{salt}")));
    STANDARD.encode(Sha256::digest(format!("{secret}{challenge}")))
}
struct Obs {
    socket: WebSocket<TcpStream>,
    next: u32,
}
impl Obs {
    fn connect() -> Result<Self, Error> {
        Self::connect_at(SocketAddr::from(([127, 0, 0, 1], 4455)), None)
    }
    fn connect_at(address: SocketAddr, password: Option<&str>) -> Result<Self, Error> {
        let stream =
            TcpStream::connect_timeout(&address, Duration::from_secs(3)).map_err(|_| {
                Error::Invalid("Abra o OBS e habilite o WebSocket local na porta 4455".into())
            })?;
        stream.set_read_timeout(Some(Duration::from_secs(5)))?;
        stream.set_write_timeout(Some(Duration::from_secs(5)))?;
        let config = tungstenite::protocol::WebSocketConfig::default()
            .max_message_size(Some(262144))
            .max_frame_size(Some(262144));
        let (socket, _) = tungstenite::client::client_with_config(
            format!("ws://{address}"),
            stream,
            Some(config),
        )
        .map_err(|_| Error::Invalid("Handshake WebSocket OBS falhou".into()))?;
        let mut obs = Self { socket, next: 0 };
        let hello = obs.read()?;
        if hello["op"] != 0 {
            return Err(Error::Invalid(
                "Servidor não apresentou Hello OBS v5".into(),
            ));
        }
        let mut d = json!({"rpcVersion":1,"eventSubscriptions":0});
        if hello["d"]["authentication"].is_object() {
            let a = &hello["d"]["authentication"];
            let salt = a["salt"]
                .as_str()
                .ok_or_else(|| Error::Invalid("Salt OBS inválido".into()))?;
            let challenge = a["challenge"]
                .as_str()
                .ok_or_else(|| Error::Invalid("Challenge OBS inválido".into()))?;
            d["authentication"] = json!(auth(
                &match password {
                    Some(p) => p.to_string(),
                    None => secrets::read("obs_password")?,
                },
                salt,
                challenge
            ));
        }
        obs.send(json!({"op":1,"d":d}))?;
        if obs.read()?["op"] != 2 {
            return Err(Error::Invalid("Autenticação OBS não foi aceita".into()));
        }
        Ok(obs)
    }
    fn send(&mut self, v: Value) -> Result<(), Error> {
        self.socket
            .send(Message::Text(v.to_string().into()))
            .map_err(|_| Error::Invalid("Conexão OBS interrompida".into()))
    }
    fn read(&mut self) -> Result<Value, Error> {
        let deadline = Instant::now() + Duration::from_secs(8);
        while Instant::now() < deadline {
            match self.socket.read().map_err(|_| {
                Error::Invalid(
                    "OBS desconectou, recusou autenticação ou excedeu o tempo limite".into(),
                )
            })? {
                Message::Text(t) => {
                    if t.len() > 262144 {
                        return Err(Error::Invalid("Resposta OBS excedeu limite".into()));
                    }
                    return Ok(serde_json::from_str(t.as_str())?);
                }
                Message::Ping(_) => self
                    .socket
                    .flush()
                    .map_err(|_| Error::Invalid("Falha no ping OBS".into()))?,
                Message::Close(_) => break,
                _ => {}
            }
        }
        Err(Error::Invalid("Sem resposta válida do OBS".into()))
    }
    fn request(&mut self, kind: &str, data: Value) -> Result<Value, Error> {
        self.next += 1;
        let id = self.next.to_string();
        self.send(json!({"op":6,"d":{"requestType":kind,"requestId":id,"requestData":data}}))?;
        for _ in 0..20 {
            let reply = self.read()?;
            if reply["op"] == 7 && reply["d"]["requestId"] == id {
                if reply["d"]["requestStatus"]["result"] != true {
                    return Err(Error::Invalid(format!(
                        "OBS recusou {kind} (código {})",
                        reply["d"]["requestStatus"]["code"]
                    )));
                }
                return Ok(reply["d"]["responseData"].clone());
            }
        }
        Err(Error::Invalid("OBS não respondeu à solicitação".into()))
    }
    fn idle(&mut self) -> Result<(), Error> {
        if self.request("GetStreamStatus", json!({}))?["outputActive"] == true
            || self.request("GetRecordStatus", json!({}))?["outputActive"] == true
        {
            return Err(Error::Invalid(
                "Pare a transmissão e a gravação antes de alterar ou restaurar perfis".into(),
            ));
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct ObsState {
    pub version: String,
    pub profile: String,
    pub streaming: bool,
    pub recording: bool,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
}
pub fn auto_connect() -> Result<ObsState, Error> {
    let data = crate::data_dir();
    let parent = data
        .parent()
        .ok_or_else(|| Error::Invalid("Pasta de configuração indisponível".into()))?;
    let path = parent.join("obs-studio/plugin_config/obs-websocket/config.json");
    let bytes = std::fs::read(path).map_err(|_| {
        Error::Invalid(
            "Configuração OBS não encontrada. Abra o OBS e habilite o servidor WebSocket.".into(),
        )
    })?;
    if bytes.len() > 65536 {
        return Err(Error::Invalid("Configuração OBS excedeu o limite".into()));
    }
    let v: Value = serde_json::from_slice(&bytes)?;
    if v["server_enabled"] != true {
        return Err(Error::Invalid("Habilite o servidor WebSocket nas Ferramentas do OBS. Nenhuma porta foi aberta pelo GameForge.".into()));
    }
    if v["server_port"].as_u64().unwrap_or(4455) != 4455 {
        return Err(Error::Invalid(
            "Esta versão conecta à porta 4455; ajuste a porta no OBS ou use a configuração manual."
                .into(),
        ));
    }
    if v["auth_required"] != false {
        let password = v["server_password"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| Error::Invalid("Senha OBS ausente na configuração".into()))?;
        secrets::put("obs_password", password)?;
    }
    status()
}
pub fn status() -> Result<ObsState, Error> {
    let mut o = Obs::connect()?;
    let version = o.request("GetVersion", json!({}))?;
    let profiles = o.request("GetProfileList", json!({}))?;
    let video = o.request("GetVideoSettings", json!({}))?;
    Ok(ObsState {
        version: version["obsVersion"]
            .as_str()
            .unwrap_or("indisponível")
            .into(),
        profile: profiles["currentProfileName"]
            .as_str()
            .unwrap_or("indisponível")
            .into(),
        streaming: o.request("GetStreamStatus", json!({}))?["outputActive"] == true,
        recording: o.request("GetRecordStatus", json!({}))?["outputActive"] == true,
        width: video["outputWidth"].as_u64().unwrap_or(0) as u32,
        height: video["outputHeight"].as_u64().unwrap_or(0) as u32,
        fps: video["fpsNumerator"].as_f64().unwrap_or(0.)
            / video["fpsDenominator"].as_f64().unwrap_or(1.),
    })
}
#[derive(Clone, Serialize, Deserialize)]
pub struct StreamTarget {
    pub platform: String,
    pub server: String,
}
impl StreamTarget {
    pub fn validate(&self) -> Result<(), Error> {
        if !["twitch", "kick", "youtube", "custom"].contains(&self.platform.as_str())
            || self.server.len() > 500
        {
            return Err(Error::Invalid("Plataforma inválida".into()));
        }
        let u = reqwest::Url::parse(&self.server).map_err(|_| {
            Error::Invalid("Informe a URL de servidor do painel da plataforma".into())
        })?;
        if !["rtmp", "rtmps"].contains(&u.scheme())
            || u.host_str().is_none()
            || !u.username().is_empty()
            || u.password().is_some()
            || u.query().is_some()
            || u.fragment().is_some()
        {
            return Err(Error::Invalid(
                "Use uma URL RTMP/RTMPS de servidor, sem chave, senha, query ou fragmento".into(),
            ));
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
struct ProfileJournal {
    previous: String,
    created: String,
    video: StreamVideo,
    platform: String,
    #[serde(default)]
    fingerprint: Option<String>,
}
pub fn apply(
    store: &PreferenceStore,
    video: StreamVideo,
    target: StreamTarget,
) -> Result<Operation, Error> {
    video.validate()?;
    target.validate()?;
    let key = secrets::read(&format!("stream_key_{}", target.platform))?;
    apply_connected(store, video, target, key, Obs::connect()?)
}
fn apply_connected(
    store: &PreferenceStore,
    video: StreamVideo,
    target: StreamTarget,
    key: String,
    mut obs: Obs,
) -> Result<Operation, Error> {
    video.validate()?;
    target.validate()?;
    let _lock = store.acquire_lock()?;
    if store
        .operations()?
        .iter()
        .any(|o| o.kind == "obs" && ["pending", "recovery_required"].contains(&o.status.as_str()))
    {
        return Err(Error::Invalid(
            "Recupere a operação OBS anterior antes de aplicar outra".into(),
        ));
    }
    obs.idle()?;
    let profiles = obs.request("GetProfileList", json!({}))?;
    let previous = profiles["currentProfileName"]
        .as_str()
        .ok_or_else(|| Error::Invalid("Perfil atual OBS indisponível".into()))?
        .to_string();
    let id = stamp()?;
    let created = format!("GameForge {} {id}", target.platform);
    let mut journal = ProfileJournal {
        previous,
        created,
        video: video.clone(),
        platform: target.platform.clone(),
        fingerprint: None,
    };
    if profiles["profiles"]
        .as_array()
        .is_some_and(|a| a.iter().any(|v| v.as_str() == Some(&journal.created)))
    {
        return Err(Error::Invalid("Já existe um perfil com este nome".into()));
    }
    let mut op = Operation {
        id: id.clone(),
        kind: "obs".into(),
        status: "pending".into(),
        summary: format!(
            "Perfil {} · {}x{} {} FPS · {} kbps",
            target.platform, video.width, video.height, video.fps, video.bitrate
        ),
        error: None,
        payload: serde_json::to_value(&journal)?,
    };
    store.save_operation(&op)?;
    let result = (|| -> Result<(), Error> {
        obs.request("CreateProfile", json!({"profileName":journal.created}))?;
        obs.request("SetCurrentProfile", json!({"profileName":journal.created}))?;
        obs.request("SetVideoSettings",json!({"baseWidth":video.width,"baseHeight":video.height,"outputWidth":video.width,"outputHeight":video.height,"fpsNumerator":video.fps,"fpsDenominator":1}))?;
        for (category, parameter, value) in [
            ("Output", "Mode", "Simple".to_string()),
            ("SimpleOutput", "StreamEncoder", "x264".into()),
            ("SimpleOutput", "VBitrate", video.bitrate.to_string()),
            ("SimpleOutput", "Preset", "veryfast".into()),
            ("SimpleOutput", "UseAdvanced", "true".into()),
            (
                "SimpleOutput",
                "x264Settings",
                format!("keyint={}", video.fps * 2),
            ),
        ] {
            obs.request("SetProfileParameter",json!({"parameterCategory":category,"parameterName":parameter,"parameterValue":value}))?;
        }
        obs.request("SetStreamServiceSettings",json!({"streamServiceType":"rtmp_custom","streamServiceSettings":{"server":target.server,"key":key,"use_auth":false}}))?;
        obs.request("SetCurrentProfile", json!({"profileName":journal.previous}))?;
        obs.request("SetCurrentProfile", json!({"profileName":journal.created}))?;
        let now = obs.request("GetVideoSettings", json!({}))?;
        if now["outputWidth"] != video.width
            || now["outputHeight"] != video.height
            || now["fpsNumerator"] != video.fps
            || now["fpsDenominator"] != 1
        {
            return Err(Error::Invalid("Verificação do vídeo OBS falhou".into()));
        }
        for (category, parameter, expected) in [
            ("Output", "Mode", "Simple".to_string()),
            ("SimpleOutput", "StreamEncoder", "x264".into()),
            ("SimpleOutput", "VBitrate", video.bitrate.to_string()),
            ("SimpleOutput", "Preset", "veryfast".into()),
            ("SimpleOutput", "UseAdvanced", "true".into()),
            (
                "SimpleOutput",
                "x264Settings",
                format!("keyint={}", video.fps * 2),
            ),
        ] {
            if obs.request(
                "GetProfileParameter",
                json!({"parameterCategory":category,"parameterName":parameter}),
            )?["parameterValue"]
                != expected
            {
                return Err(Error::Invalid(
                    "OBS não confirmou parâmetro de saída".into(),
                ));
            }
        }
        let destination = obs.request("GetStreamServiceSettings", json!({}))?;
        if destination["streamServiceType"] != "rtmp_custom"
            || destination["streamServiceSettings"]["server"] != target.server
            || destination["streamServiceSettings"]["key"] != key
        {
            return Err(Error::Invalid(
                "OBS não confirmou o destino e a credencial de transmissão".into(),
            ));
        }
        journal.fingerprint = Some(profile_fingerprint(&mut obs)?);
        Ok(())
    })();
    match result {
        Ok(()) => {
            op.payload = serde_json::to_value(&journal)?;
            op.status = "applied".into();
            store.save_operation(&op)?;
            Ok(op)
        }
        Err(e) => {
            op.error = Some(e.to_string());
            let reverted = rollback(&mut obs, &journal).is_ok();
            op.status = if reverted {
                "rolled_back"
            } else {
                "recovery_required"
            }
            .into();
            store.save_operation(&op)?;
            Err(Error::Invalid(format!(
                "{}; {}",
                e,
                if reverted {
                    "perfil anterior restaurado"
                } else {
                    "recuperação pendente no Histórico"
                }
            )))
        }
    }
}
fn profile_fingerprint(obs: &mut Obs) -> Result<String, Error> {
    let video = obs.request("GetVideoSettings", json!({}))?;
    let service = obs.request("GetStreamServiceSettings", json!({}))?;
    let mut params = Vec::new();
    for (category, name) in [
        ("Output", "Mode"),
        ("SimpleOutput", "StreamEncoder"),
        ("SimpleOutput", "VBitrate"),
        ("SimpleOutput", "Preset"),
        ("SimpleOutput", "UseAdvanced"),
        ("SimpleOutput", "x264Settings"),
    ] {
        params.push(obs.request(
            "GetProfileParameter",
            json!({"parameterCategory":category,"parameterName":name}),
        )?);
    }
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(
            &json!({"video":video,"service":service,"params":params})
        )?)
    ))
}
fn rollback(obs: &mut Obs, j: &ProfileJournal) -> Result<(), Error> {
    obs.idle()?;
    obs.request("SetCurrentProfile", json!({"profileName":j.previous}))?;
    let profiles = obs.request("GetProfileList", json!({}))?;
    if profiles["profiles"]
        .as_array()
        .is_some_and(|a| a.iter().any(|x| x.as_str() == Some(&j.created)))
    {
        obs.request("RemoveProfile", json!({"profileName":j.created}))?;
    }
    Ok(())
}
pub fn restore(store: &PreferenceStore, id: &str) -> Result<Operation, Error> {
    restore_connected(store, id, Obs::connect()?)
}
fn restore_connected(store: &PreferenceStore, id: &str, mut obs: Obs) -> Result<Operation, Error> {
    let _lock = store.acquire_lock()?;
    let mut op = store.operation(id)?;
    if op.kind != "obs"
        || !["applied", "pending", "recovery_required"].contains(&op.status.as_str())
    {
        return Err(Error::Invalid(
            "Operação OBS não pode ser restaurada".into(),
        ));
    }
    let j: ProfileJournal = serde_json::from_value(op.payload.clone())?;
    obs.idle()?;
    let current = obs.request("GetProfileList", json!({}))?;
    let name = current["currentProfileName"].as_str().unwrap_or("");
    if name != j.created && name != j.previous {
        return Err(Error::Invalid(
            "O perfil OBS mudou externamente; restauração bloqueada".into(),
        ));
    }
    if op.status == "applied" {
        if name != j.created {
            return Err(Error::Invalid(
                "Selecione no OBS o perfil GameForge desta operação antes de restaurar".into(),
            ));
        }
        if let Some(expected) = &j.fingerprint {
            if &profile_fingerprint(&mut obs)? != expected {
                return Err(Error::Invalid("O perfil foi editado desde a aplicação; restauração bloqueada para preservar suas alterações".into()));
            }
        }
    }
    rollback(&mut obs, &j)?;
    op.status = "restored".into();
    op.error = None;
    store.save_operation(&op)?;
    Ok(op)
}

pub fn open_app() -> Result<(), Error> {
    #[cfg(windows)]
    {
        let system = sysinfo::System::new_all();
        if system
            .processes()
            .values()
            .any(|p| p.name().to_string_lossy().eq_ignore_ascii_case("obs64.exe"))
        {
            return Ok(());
        }
        let path = std::env::var_os("ProgramFiles")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from(r"C:\Program Files"))
            .join("obs-studio/bin/64bit/obs64.exe");
        if !path.is_file() {
            return Err(Error::Invalid(
                "OBS não encontrado no local padrão. Abra a instalação personalizada manualmente."
                    .into(),
            ));
        }
        std::process::Command::new(&path)
            .current_dir(
                path.parent()
                    .ok_or_else(|| Error::Invalid("Diretório OBS indisponível".into()))?,
            )
            .spawn()?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .args(["-a", "OBS"])
            .spawn()?;
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Err(Error::Invalid("Plataforma sem suporte".into()))
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct FixtureProfile {
        video: Value,
        params: std::collections::BTreeMap<String, String>,
        service: Value,
    }
    struct FixtureState {
        current: String,
        profiles: std::collections::BTreeMap<String, FixtureProfile>,
    }
    fn fixture_server(
        connections: usize,
        reject_service: bool,
    ) -> (
        SocketAddr,
        std::sync::Arc<std::sync::Mutex<FixtureState>>,
        std::thread::JoinHandle<()>,
    ) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("listener");
        let address = listener.local_addr().expect("address");
        let original = FixtureProfile {
            video: json!({"baseWidth":1920,"baseHeight":1080,"outputWidth":1920,"outputHeight":1080,"fpsNumerator":60,"fpsDenominator":1}),
            params: std::collections::BTreeMap::new(),
            service: json!({"streamServiceType":"rtmp_custom","streamServiceSettings":{"server":"rtmp://original.example/app","key":"original-secret"}}),
        };
        let state = std::sync::Arc::new(std::sync::Mutex::new(FixtureState {
            current: "Original".into(),
            profiles: std::collections::BTreeMap::from([("Original".into(), original)]),
        }));
        let server_state = state.clone();
        let thread = std::thread::spawn(move || {
            for _ in 0..connections {
                let (stream, _) = listener.accept().expect("accept");
                let mut ws = tungstenite::accept(stream).expect("ws");
                ws.send(Message::Text(
                    json!({"op":0,"d":{"rpcVersion":1}}).to_string().into(),
                ))
                .expect("hello");
                let _ = ws.read().expect("identify");
                ws.send(Message::Text(
                    json!({"op":2,"d":{"negotiatedRpcVersion":1}})
                        .to_string()
                        .into(),
                ))
                .expect("identified");
                while let Ok(Message::Text(text)) = ws.read() {
                    let request: Value = serde_json::from_str(text.as_str()).expect("request");
                    let d = &request["d"];
                    let data = &d["requestData"];
                    let kind = d["requestType"].as_str().expect("type");
                    let mut st = server_state.lock().expect("state");
                    let current = st.current.clone();
                    let mut ok = true;
                    let reply = match kind {
                        "GetStreamStatus" | "GetRecordStatus" => json!({"outputActive":false}),
                        "GetProfileList" => {
                            json!({"currentProfileName":st.current,"profiles":st.profiles.keys().collect::<Vec<_>>()})
                        }
                        "CreateProfile" => {
                            let name = data["profileName"].as_str().expect("name").to_string();
                            let p = st.profiles[&current].clone();
                            st.profiles.insert(name.clone(), p);
                            st.current = name;
                            json!({})
                        }
                        "SetCurrentProfile" => {
                            let name = data["profileName"].as_str().expect("name").to_string();
                            assert!(st.profiles.contains_key(&name));
                            st.current = name;
                            json!({})
                        }
                        "RemoveProfile" => {
                            let name = data["profileName"].as_str().expect("name");
                            assert_ne!(name, st.current);
                            st.profiles.remove(name);
                            json!({})
                        }
                        "SetVideoSettings" => {
                            st.profiles.get_mut(&current).expect("profile").video = data.clone();
                            json!({})
                        }
                        "GetVideoSettings" => st.profiles[&current].video.clone(),
                        "SetProfileParameter" => {
                            let key = format!(
                                "{}:{}",
                                data["parameterCategory"].as_str().expect("category"),
                                data["parameterName"].as_str().expect("param")
                            );
                            st.profiles
                                .get_mut(&current)
                                .expect("profile")
                                .params
                                .insert(
                                    key,
                                    data["parameterValue"].as_str().expect("value").into(),
                                );
                            json!({})
                        }
                        "GetProfileParameter" => {
                            let key = format!(
                                "{}:{}",
                                data["parameterCategory"].as_str().expect("category"),
                                data["parameterName"].as_str().expect("param")
                            );
                            json!({"parameterValue":st.profiles[&current].params.get(&key),"defaultParameterValue":null})
                        }
                        "SetStreamServiceSettings" => {
                            if reject_service {
                                ok = false;
                            } else {
                                st.profiles.get_mut(&current).expect("profile").service =
                                    data.clone();
                            }
                            json!({})
                        }
                        "GetStreamServiceSettings" => st.profiles[&current].service.clone(),
                        _ => panic!("Unexpected protocol request {kind}"),
                    };
                    drop(st);
                    ws.send(Message::Text(json!({"op":7,"d":{"requestId":d["requestId"],"requestStatus":{"result":ok,"code":if ok{100}else{500}},"responseData":reply}}).to_string().into())).expect("reply");
                }
            }
        });
        (address, state, thread)
    }
    #[test]
    fn profile_apply_undo_and_secret_exclusion() {
        let (address, state, server) = fixture_server(2, false);
        let store = PreferenceStore::new(
            std::env::temp_dir().join(format!("gf-obs-{}", stamp().expect("id"))),
        );
        let op = apply_connected(
            &store,
            StreamVideo {
                width: 1280,
                height: 720,
                fps: 30,
                bitrate: 3500,
            },
            StreamTarget {
                platform: "twitch".into(),
                server: "rtmp://fixture.example/app".into(),
            },
            "fixture-stream-secret".into(),
            Obs::connect_at(address, None).expect("connect"),
        )
        .expect("apply");
        assert_eq!(op.status, "applied");
        let serialized =
            serde_json::to_string(&store.operations().expect("history")).expect("json");
        assert!(!serialized.contains("fixture-stream-secret"));
        assert!(!serialized.contains("original-secret"));
        let undone = restore_connected(
            &store,
            &op.id,
            Obs::connect_at(address, None).expect("connect"),
        )
        .expect("undo");
        assert_eq!(undone.status, "restored");
        server.join().expect("server");
        let st = state.lock().expect("state");
        assert_eq!(st.current, "Original");
        assert_eq!(st.profiles.len(), 1);
        assert_eq!(st.profiles["Original"].video["outputWidth"], 1920);
        drop(st);
        std::fs::remove_dir_all(&store.dir).expect("cleanup");
    }
    #[test]
    fn profile_failure_restores_original() {
        let (address, state, server) = fixture_server(1, true);
        let store = PreferenceStore::new(
            std::env::temp_dir().join(format!("gf-obs-{}", stamp().expect("id"))),
        );
        assert!(apply_connected(
            &store,
            StreamVideo {
                width: 1280,
                height: 720,
                fps: 30,
                bitrate: 3500
            },
            StreamTarget {
                platform: "kick".into(),
                server: "rtmps://fixture.example/app".into()
            },
            "fixture-secret".into(),
            Obs::connect_at(address, None).expect("connect")
        )
        .is_err());
        server.join().expect("server");
        assert_eq!(
            store.operations().expect("history")[0].status,
            "rolled_back"
        );
        let st = state.lock().expect("state");
        assert_eq!(st.current, "Original");
        assert_eq!(st.profiles.len(), 1);
        drop(st);
        std::fs::remove_dir_all(&store.dir).expect("cleanup");
    }
    #[test]
    fn websocket_protocol_auth_and_redacted_errors() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("address");
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().expect("accept");
            let mut ws = tungstenite::accept(stream).expect("handshake");
            ws.send(Message::Text(json!({"op":0,"d":{"rpcVersion":1,"authentication":{"salt":"fixture-salt","challenge":"fixture-challenge"}}}).to_string().into())).expect("hello");
            let identify: Value =
                serde_json::from_str(ws.read().expect("identify").to_text().expect("text"))
                    .expect("json");
            assert_eq!(
                identify["d"]["authentication"],
                auth("fixture-password", "fixture-salt", "fixture-challenge")
            );
            ws.send(Message::Text(
                json!({"op":2,"d":{"negotiatedRpcVersion":1}})
                    .to_string()
                    .into(),
            ))
            .expect("identified");
            for ok in [true, false] {
                let request: Value =
                    serde_json::from_str(ws.read().expect("request").to_text().expect("text"))
                        .expect("json");
                ws.send(Message::Text(json!({"op":7,"d":{"requestId":request["d"]["requestId"],"requestStatus":{"result":ok,"code":if ok{100}else{500},"comment":"DO_NOT_EXPOSE_SECRET"},"responseData":{"outputWidth":1280}}}).to_string().into())).expect("reply");
            }
        });
        let mut obs = Obs::connect_at(address, Some("fixture-password")).expect("connect");
        assert_eq!(
            obs.request("GetVideoSettings", json!({})).expect("request")["outputWidth"],
            1280
        );
        let error = obs
            .request("SetVideoSettings", json!({}))
            .expect_err("rejected")
            .to_string();
        assert!(error.contains("500"));
        assert!(!error.contains("DO_NOT_EXPOSE_SECRET"));
        server.join().expect("server");
    }
    #[test]
    fn auth_is_deterministic_and_does_not_return_password() {
        assert_eq!(
            auth("pass", "salt", "challenge"),
            "EabUNw4z9EKKpEOC0yvqBO8dJPSIcTb82eo+adWKOvk=".to_string()
        );
    }
    #[test]
    fn validates_stream_servers() {
        assert!(StreamTarget {
            platform: "kick".into(),
            server: "rtmps://example.com:443/app".into()
        }
        .validate()
        .is_ok());
        for bad in [
            "https://example.com",
            "rtmp://user:pass@example.com/app",
            "rtmp://example.com/app?token=secret",
        ] {
            assert!(StreamTarget {
                platform: "custom".into(),
                server: bad.into()
            }
            .validate()
            .is_err());
        }
    }
}
