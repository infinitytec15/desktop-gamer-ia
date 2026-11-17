fn main() {
    println!("cargo:rerun-if-env-changed=GAMEFORGE_API_URL");
    println!("cargo:rerun-if-env-changed=GAMEFORGE_LICENSE_PUBLIC_KEY_B64");
    println!("cargo:rerun-if-changed=../../config/desktop-cloud.json");
    let content = std::fs::read_to_string("../../config/desktop-cloud.json");
    if let Ok(content) = content {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
            for (env, field) in [
                ("GAMEFORGE_API_URL", "api_url"),
                ("GAMEFORGE_LICENSE_PUBLIC_KEY_B64", "public_key"),
            ] {
                if std::env::var(env).is_ok() {
                    continue;
                }
                if let Some(value) = config[field].as_str() {
                    if !value.is_empty() && !value.contains(['\n', '\r']) {
                        println!("cargo:rustc-env={env}={value}");
                    }
                }
            }
        }
    }
}
