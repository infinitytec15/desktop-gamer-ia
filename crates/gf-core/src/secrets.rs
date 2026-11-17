use crate::Error;
const NAMES: &[&str] = &[
    "anthropic",
    "openai",
    "obs_password",
    "stream_key_twitch",
    "stream_key_kick",
    "stream_key_youtube",
    "stream_key_custom",
];
pub fn save(name: &str, value: &str) -> Result<(), Error> {
    if !NAMES.contains(&name) || value.is_empty() || value.len() > 2400 {
        return Err(Error::Invalid("Credencial inválida".into()));
    }
    put(name, value)
}
pub(crate) fn put(name: &str, value: &str) -> Result<(), Error> {
    keyring::Entry::new("GameForgeAI", name)
        .and_then(|e| e.set_password(value))
        .map_err(|_| {
            Error::Invalid("Não foi possível gravar no cofre de credenciais do sistema".into())
        })
}
pub(crate) fn read(name: &str) -> Result<String, Error> {
    keyring::Entry::new("GameForgeAI", name)
        .and_then(|e| e.get_password())
        .map_err(|_| Error::Invalid(format!("Configure a credencial {name} no aplicativo")))
}
pub fn status() -> Vec<String> {
    NAMES
        .iter()
        .filter(|n| read(n).is_ok())
        .map(|n| n.to_string())
        .collect()
}
pub fn remove(name: &str) -> Result<(), Error> {
    if !NAMES.contains(&name) {
        return Err(Error::Invalid("Credencial desconhecida".into()));
    }
    erase(name)
}
pub(crate) fn erase(name: &str) -> Result<(), Error> {
    let e = keyring::Entry::new("GameForgeAI", name)
        .map_err(|_| Error::Invalid("Cofre indisponível".into()))?;
    match e.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(Error::Invalid(
            "Não foi possível remover a credencial".into(),
        )),
    }
}
