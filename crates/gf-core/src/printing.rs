use crate::{automation::Operation, Error, PreferenceStore};
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
use std::{io::Write, path::Path};
fn validate_name(name: &str) -> Result<(), Error> {
    let extension = name.rsplit('.').next().unwrap_or("");
    if name.is_empty()
        || name.len() > 120
        || name.contains("..")
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_')
        || !["json", "ini", "curaprofile", "csv", "stl", "txt"].contains(&extension)
    {
        return Err(Error::Invalid(
            "Nome ou formato de exportação não permitido".into(),
        ));
    }
    Ok(())
}
fn write_new(dir: &Path, name: &str, bytes: &[u8]) -> Result<String, Error> {
    validate_name(name)?;
    if bytes.is_empty() || bytes.len() > 20 * 1024 * 1024 {
        return Err(Error::Invalid("Exportação deve ter até 20 MiB".into()));
    }
    std::fs::create_dir_all(dir)?;
    let path = dir.join(format!("{}-{name}", uuid::Uuid::new_v4()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(path.to_string_lossy().into())
}
pub fn save(store: &PreferenceStore, name: &str, data: &str) -> Result<String, Error> {
    validate_name(name)?;
    if data.len() > 28 * 1024 * 1024 {
        return Err(Error::Invalid("Exportação excede o limite".into()));
    }
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| Error::Invalid("Conteúdo de exportação inválido".into()))?;
    let id = uuid::Uuid::new_v4().to_string();
    let mut op = Operation {
        id: id.clone(),
        kind: "printing_export".into(),
        status: "prepared".into(),
        summary: format!("Cópia de impressão 3D: {name}"),
        error: None,
        payload: serde_json::json!({"file":name,"bytes":bytes.len(),"sha256":format!("{:x}",Sha256::digest(&bytes)),"native_import_verified":false,"source_files_modified":false}),
    };
    store.save_operation(&op)?;
    match write_new(&store.dir.join("exports"), name, &bytes) {
        Ok(path) => {
            op.status = "exported".into();
            store.save_operation(&op)?;
            Ok(path)
        }
        Err(error) => {
            op.status = "failed".into();
            op.error = Some(error.to_string());
            store.save_operation(&op)?;
            Err(error)
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exports_are_new_and_do_not_accept_paths_or_executables() {
        let root = std::env::temp_dir().join(format!("gf-print-{}", uuid::Uuid::new_v4()));
        let a = write_new(&root, "preset.json", b"{\"fixture\":1}").expect("export");
        let b = write_new(&root, "preset.json", b"{\"fixture\":2}").expect("export");
        assert_ne!(a, b);
        assert_eq!(std::fs::read(&a).expect("read"), b"{\"fixture\":1}");
        for name in [
            "../evil.json",
            "bad.exe",
            "a.ps1",
            "C:\\bad.json",
            "bad/good.json",
        ] {
            assert!(write_new(&root, name, b"fixture").is_err())
        }
        std::fs::remove_dir_all(root).expect("cleanup")
    }
}
