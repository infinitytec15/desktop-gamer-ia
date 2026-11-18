//! Entitlements verified against a build-time Ed25519 public key. No provider keys in public builds.
use crate::{automation::OptimizationPlan, secrets, Error};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::Read,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use ts_rs::TS;
static LOCK: Mutex<()> = Mutex::new(());
const API_URL: &str = match option_env!("GAMEFORGE_API_URL") {
    Some(v) => v,
    None => "",
};
const PUBLIC_KEY: &str = match option_env!("GAMEFORGE_LICENSE_PUBLIC_KEY_B64") {
    Some(v) => v,
    None => "",
};
const VAULT: &str = "cloud_activation_v1";
#[derive(Clone, Serialize, Deserialize)]
struct Envelope {
    payload: String,
    signature: String,
}
#[derive(Clone, Serialize, Deserialize)]
struct Activation {
    refresh_token: String,
    device_id: String,
    entitlements: Envelope,
    last_verified: u64,
}
#[derive(Deserialize)]
struct Claims {
    aud: String,
    iss: String,
    device_id: String,
    license_id: String,
    plan_id: String,
    features: Vec<String>,
    iat: u64,
    exp: u64,
}
#[derive(Serialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct LicenseStatus {
    pub active: bool,
    pub configured: bool,
    pub plan: Option<String>,
    pub expires_at: Option<f64>,
    pub website: String,
    pub message: String,
}
fn now() -> Result<u64, Error> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| Error::Invalid(e.to_string()))?
        .as_secs())
}
fn invalid(message: &str) -> Error {
    Error::Invalid(message.into())
}
fn configured() -> bool {
    !API_URL.is_empty() && !PUBLIC_KEY.is_empty()
}
fn endpoint(path: &str) -> Result<String, Error> {
    let url = reqwest::Url::parse(API_URL).map_err(|_| invalid("Este instalador ainda não tem o endereço do serviço. Use um build publicado pelo operador."))?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || (url.scheme() != "https"
            && !(cfg!(debug_assertions)
                && url.scheme() == "http"
                && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))))
    {
        return Err(invalid("Endereço do serviço inválido no instalador"));
    }
    Ok(format!("{}{path}", API_URL.trim_end_matches('/')))
}
fn verify(
    envelope: &Envelope,
    device: &str,
    public: &str,
    issuer: &str,
    current: u64,
) -> Result<Claims, Error> {
    let raw = STANDARD
        .decode(public)
        .map_err(|_| invalid("Chave pública inválida no instalador"))?;
    let key_bytes: [u8; 32] = raw
        .try_into()
        .map_err(|_| invalid("Chave pública inválida"))?;
    let key =
        VerifyingKey::from_bytes(&key_bytes).map_err(|_| invalid("Chave pública inválida"))?;
    let sig = URL_SAFE_NO_PAD
        .decode(&envelope.signature)
        .map_err(|_| invalid("Assinatura inválida"))?;
    let sig = Signature::from_slice(&sig).map_err(|_| invalid("Assinatura inválida"))?;
    key.verify_strict(envelope.payload.as_bytes(), &sig)
        .map_err(|_| invalid("Licença sem assinatura confiável"))?;
    let claims: Claims = serde_json::from_slice(
        &URL_SAFE_NO_PAD
            .decode(&envelope.payload)
            .map_err(|_| invalid("Licença inválida"))?,
    )?;
    if claims.aud != "gameforge-desktop"
        || claims.iss != issuer
        || claims.device_id != device
        || claims.license_id.is_empty()
        || claims.plan_id.is_empty()
        || claims.exp <= current
        || claims.iat > current.saturating_add(300)
        || claims.exp > claims.iat.saturating_add(86400)
        || claims.exp <= claims.iat
        || claims
            .features
            .iter()
            .any(|f| !["system_optimize", "obs_configure", "ai_plans"].contains(&f.as_str()))
    {
        return Err(invalid(
            "Validação da licença expirada ou incompatível. Conecte-se e confira sua assinatura.",
        ));
    }
    Ok(claims)
}
fn read() -> Result<Activation, Error> {
    Ok(serde_json::from_str(&secrets::read(VAULT)?)?)
}
fn save(a: &Activation) -> Result<(), Error> {
    secrets::put(VAULT, &serde_json::to_string(a)?)
}
fn fingerprint() -> Result<String, Error> {
    match secrets::read("installation_id_v1") {
        Ok(v) => Ok(v),
        Err(_) => {
            let value = uuid::Uuid::new_v4().simple().to_string();
            secrets::put("installation_id_v1", &value)?;
            Ok(value)
        }
    }
}
enum CloudError {
    Network,
    Rejected(String),
}
fn post(path: &str, body: &Value, token: Option<&str>, timeout: u64) -> Result<Value, CloudError> {
    let url = endpoint(path).map_err(|e| CloudError::Rejected(e.to_string()))?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| CloudError::Network)?;
    let mut request = client.post(url).json(body);
    if let Some(t) = token {
        request = request.bearer_auth(t);
    }
    let response = request.send().map_err(|_| CloudError::Network)?;
    let status = response.status();
    let mut bytes = Vec::new();
    response
        .take(262145)
        .read_to_end(&mut bytes)
        .map_err(|_| CloudError::Network)?;
    if bytes.len() > 262144 {
        return Err(CloudError::Rejected(
            "Resposta do serviço excedeu o limite".into(),
        ));
    }
    let data: Value = serde_json::from_slice(&bytes).map_err(|_| CloudError::Network)?;
    if !status.is_success() {
        let message = data["error"]
            .as_str()
            .unwrap_or("Serviço indisponível")
            .to_string();
        if status.as_u16() >= 500 || status.as_u16() == 429 {
            return Err(CloudError::Network);
        }
        return Err(CloudError::Rejected(message));
    }
    Ok(data)
}
fn cloud_error(e: CloudError) -> Error {
    match e {
        CloudError::Network => {
            invalid("Serviço indisponível. Confira sua conexão e tente novamente.")
        }
        CloudError::Rejected(m) => invalid(&m),
    }
}
fn verified() -> Result<(Activation, Claims), Error> {
    let mut a = read()?;
    let current = now()?;
    if current.saturating_add(300) < a.last_verified {
        return Err(invalid(
            "O relógio do computador foi alterado. Corrija a data e valide novamente.",
        ));
    }
    // Refresh before privileged use; a signed lease is the only offline fallback.
    match post(
        "/api/desktop/refresh",
        &json!({}),
        Some(&a.refresh_token),
        12,
    ) {
        Ok(v) => {
            a.entitlements = serde_json::from_value(v["entitlements"].clone())?;
            verify(&a.entitlements, &a.device_id, PUBLIC_KEY, API_URL, current)?;
            a.last_verified = current;
            save(&a)?;
        }
        Err(CloudError::Rejected(m)) => {
            secrets::erase(VAULT)?;
            return Err(invalid(&m));
        }
        Err(CloudError::Network) => {}
    }
    let claims = verify(&a.entitlements, &a.device_id, PUBLIC_KEY, API_URL, current)?;
    Ok((a, claims))
}
fn status_for(result: Result<(Activation, Claims), Error>) -> LicenseStatus {
    match result {
        Ok((_, c)) => LicenseStatus {
            active: true,
            configured: configured(),
            plan: Some(c.plan_id),
            expires_at: Some(c.exp as f64),
            website: API_URL.into(),
            message:
                "Licença validada. A assinatura é conferida novamente antes de aplicar ajustes."
                    .into(),
        },
        Err(e) => LicenseStatus {
            active: false,
            configured: configured(),
            plan: None,
            expires_at: None,
            website: API_URL.into(),
            message: if configured() {
                format!("Ative este computador em Configurações → Licença. {e}")
            } else {
                "O instalador precisa ser vinculado ao domínio e à chave pública do serviço antes da distribuição.".into()
            },
        },
    }
}
pub fn status() -> LicenseStatus {
    let guard = LOCK.lock();
    match guard {
        Ok(_guard) => status_for(verified()),
        Err(_) => status_for(Err(invalid("Ativação ocupada"))),
    }
}
pub fn activate(key: &str) -> Result<LicenseStatus, Error> {
    let _guard = LOCK.lock().map_err(|_| invalid("Ativação ocupada"))?;
    let key = key.trim();
    if key.len() != 46
        || !key.starts_with("GF_")
        || !key[3..]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(invalid(
            "Chave inválida. Copie a chave completa gerada no painel.",
        ));
    }
    let current = now()?;
    let response = post("/api/desktop/activate", &json!({"key":key,"fingerprint":fingerprint()?,"name":"Meu computador GameForge","platform":std::env::consts::OS}), None, 20).map_err(cloud_error)?;
    let a = Activation {
        refresh_token: response["refresh_token"]
            .as_str()
            .ok_or_else(|| invalid("Token ausente"))?
            .into(),
        device_id: response["device_id"]
            .as_str()
            .ok_or_else(|| invalid("Dispositivo ausente"))?
            .into(),
        entitlements: serde_json::from_value(response["entitlements"].clone())?,
        last_verified: current,
    };
    let claims = verify(&a.entitlements, &a.device_id, PUBLIC_KEY, API_URL, current)?;
    save(&a)?;
    Ok(status_for(Ok((a, claims))))
}
pub fn deactivate() -> Result<(), Error> {
    let _guard = LOCK.lock().map_err(|_| invalid("Ativação ocupada"))?;
    if let Ok(a) = read() {
        let _ = post(
            "/api/desktop/deactivate",
            &json!({}),
            Some(&a.refresh_token),
            12,
        );
    }
    secrets::erase(VAULT)
}
pub fn require(feature: &str) -> Result<(), Error> {
    let _guard = LOCK.lock().map_err(|_| invalid("Ativação ocupada"))?;
    let (_, claims) = verified()?;
    if !claims.features.iter().any(|f| f == feature) {
        return Err(invalid("Sua licença não inclui este recurso"));
    }
    Ok(())
}
pub fn generate(context: &Value, allow_fallback: bool) -> Result<OptimizationPlan, Error> {
    let _guard = LOCK.lock().map_err(|_| invalid("Ativação ocupada"))?;
    let (a, claims) = verified()?;
    if !claims.features.iter().any(|f| f == "ai_plans") {
        return Err(invalid("Seu plano não inclui IA"));
    }
    let data=post("/api/desktop/ai/plan",&json!({"request_id":uuid::Uuid::new_v4().to_string(),"context":context,"allow_fallback":allow_fallback}),Some(&a.refresh_token),145).map_err(cloud_error)?;
    let plan: OptimizationPlan = serde_json::from_value(data)?;
    plan.validate()?;
    Ok(plan)
}
pub fn printing(input: &Value) -> Result<Value, Error> {
    let _guard = LOCK.lock().map_err(|_| invalid("Ativação ocupada"))?;
    let (a, claims) = verified()?;
    if !claims.features.iter().any(|f| f == "ai_plans") {
        return Err(invalid("Sua licença não inclui IA"));
    }
    if serde_json::to_vec(input)?.len() > 16384 {
        return Err(invalid("Dados de impressão excedem o limite"));
    }
    post(
        "/api/desktop/printing/ai",
        input,
        Some(&a.refresh_token),
        145,
    )
    .map_err(cloud_error)
}
#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    #[test]
    fn signature_device_issuer_expiry_and_max_window_are_enforced() {
        let key = SigningKey::from_bytes(&[7; 32]);
        let public = STANDARD.encode(key.verifying_key().as_bytes());
        let claims = json!({"aud":"gameforge-desktop","iss":"https://gameforge.test","license_id":"license","device_id":"device-a","plan_id":"core","features":["system_optimize"],"iat":1000,"exp":2000});
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).expect("claims"));
        let envelope = Envelope {
            signature: URL_SAFE_NO_PAD.encode(key.sign(payload.as_bytes()).to_bytes()),
            payload,
        };
        assert!(verify(
            &envelope,
            "device-a",
            &public,
            "https://gameforge.test",
            1500
        )
        .is_ok());
        assert!(verify(
            &envelope,
            "device-b",
            &public,
            "https://gameforge.test",
            1500
        )
        .is_err());
        assert!(verify(&envelope, "device-a", &public, "https://evil.test", 1500).is_err());
        assert!(verify(
            &envelope,
            "device-a",
            &public,
            "https://gameforge.test",
            2000
        )
        .is_err());
        let mut changed = envelope.clone();
        changed.payload.push('x');
        assert!(verify(
            &changed,
            "device-a",
            &public,
            "https://gameforge.test",
            1500
        )
        .is_err());
        assert!(verify(
            &envelope,
            "device-a",
            &public,
            "https://gameforge.test",
            100
        )
        .is_err());
    }
}
