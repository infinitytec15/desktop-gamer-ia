use crate::{
    automation::{stamp, Operation, SystemAction},
    Error, PreferenceStore,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct StoredValue {
    kind: u32,
    bytes: Vec<u8>,
}
#[derive(Serialize, Deserialize)]
struct Journal {
    actions: Vec<SystemAction>,
    before: BTreeMap<String, Option<StoredValue>>,
    after: BTreeMap<String, Option<StoredValue>>,
    restore_point: Option<String>,
}
fn desired(actions: &[SystemAction]) -> BTreeMap<String, Option<StoredValue>> {
    let mut values = BTreeMap::new();
    for action in actions {
        let entries: &[(&str, bool)] = match action {
            SystemAction::EnableGameMode => &[("game_mode_auto", true)],
            SystemAction::DisableGameCapture => &[("game_dvr", false), ("capture", false)],
            SystemAction::DisableMouseAcceleration => &[
                ("mouse_speed", false),
                ("mouse_threshold1", false),
                ("mouse_threshold2", false),
            ],
            SystemAction::HighPerformancePower => &[],
        };
        for (key, enabled) in entries {
            let v = if key.starts_with("mouse_") {
                StoredValue {
                    kind: 1,
                    bytes: "0\0".encode_utf16().flat_map(u16::to_le_bytes).collect(),
                }
            } else {
                StoredValue {
                    kind: 4,
                    bytes: u32::from(*enabled).to_le_bytes().to_vec(),
                }
            };
            values.insert(key.to_string(), Some(v));
        }
        if *action == SystemAction::HighPerformancePower {
            values.insert(
                "power_plan".into(),
                Some(StoredValue {
                    kind: 0,
                    bytes: b"8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c".to_vec(),
                }),
            );
        }
    }
    values
}
fn validate(actions: &[SystemAction]) -> Result<(), Error> {
    if actions.is_empty()
        || actions.len() > 4
        || actions
            .iter()
            .collect::<std::collections::BTreeSet<_>>()
            .len()
            != actions.len()
    {
        return Err(Error::Invalid("Escolha de 1 a 4 ações distintas".into()));
    }
    Ok(())
}
pub fn prepare(store: &PreferenceStore, actions: Vec<SystemAction>) -> Result<Operation, Error> {
    validate(&actions)?;
    let _lock = store.acquire_lock()?;
    if store.operations()?.iter().any(|o| {
        o.kind == "system"
            && ["approved", "pending", "recovery_required"].contains(&o.status.as_str())
    }) {
        return Err(Error::Invalid(
            "Recupere a operação de sistema anterior no Histórico".into(),
        ));
    }
    let after = desired(&actions);
    let before = read_all(&after)?;
    if before == after {
        return Err(Error::Invalid(
            "As configurações selecionadas já estão nesse estado. Nenhuma alteração necessária."
                .into(),
        ));
    }
    let op = Operation {
        id: stamp()?,
        kind: "system".into(),
        status: "approved".into(),
        summary: "Ajustes Windows: Game Mode, captura, mouse ou energia, conforme seleção".into(),
        error: None,
        payload: serde_json::to_value(Journal {
            actions,
            before,
            after,
            restore_point: None,
        })?,
    };
    store.save_operation(&op)?;
    Ok(op)
}
fn read_all(
    keys: &BTreeMap<String, Option<StoredValue>>,
) -> Result<BTreeMap<String, Option<StoredValue>>, Error> {
    keys.keys()
        .map(|k| Ok((k.clone(), native::read(k)?)))
        .collect()
}

trait Backend {
    fn read(&self, key: &str) -> Result<Option<StoredValue>, Error>;
    fn write(&self, key: &str, value: Option<&StoredValue>) -> Result<(), Error>;
}
struct NativeBackend;
impl Backend for NativeBackend {
    fn read(&self, key: &str) -> Result<Option<StoredValue>, Error> {
        native::read(key)
    }
    fn write(&self, key: &str, value: Option<&StoredValue>) -> Result<(), Error> {
        native::write(key, value)
    }
}
fn read_using(
    b: &impl Backend,
    keys: &BTreeMap<String, Option<StoredValue>>,
) -> Result<BTreeMap<String, Option<StoredValue>>, Error> {
    keys.keys().map(|k| Ok((k.clone(), b.read(k)?))).collect()
}
fn write_using(
    b: &impl Backend,
    values: &BTreeMap<String, Option<StoredValue>>,
) -> Result<(), Error> {
    for (k, v) in values {
        b.write(k, v.as_ref())?;
    }
    if read_using(b, values)? != *values {
        return Err(Error::Invalid(
            "Verificação das alterações Windows falhou".into(),
        ));
    }
    Ok(())
}
fn compensate_using(
    b: &impl Backend,
    before: &BTreeMap<String, Option<StoredValue>>,
    after: &BTreeMap<String, Option<StoredValue>>,
) -> Result<(), Error> {
    let current = read_using(b, before)?;
    for (k, c) in &current {
        if Some(c) != before.get(k) && Some(c) != after.get(k) {
            return Err(Error::Invalid(
                "Conflito externo durante recuperação".into(),
            ));
        }
    }
    for (k, v) in before.iter().rev() {
        b.write(k, v.as_ref())?;
    }
    if read_using(b, before)? != *before {
        return Err(Error::Invalid("Restauração não foi confirmada".into()));
    }
    Ok(())
}
fn write_all(values: &BTreeMap<String, Option<StoredValue>>) -> Result<(), Error> {
    write_using(&NativeBackend, values)
}
fn compensate(
    before: &BTreeMap<String, Option<StoredValue>>,
    after: &BTreeMap<String, Option<StoredValue>>,
) -> Result<(), Error> {
    compensate_using(&NativeBackend, before, after)
}
/// This runs only in the dedicated elevated process, before initializing Tauri.
pub fn helper(store: &PreferenceStore, id: &str, restore: bool) -> Result<Operation, Error> {
    if id.is_empty() || id.len() > 32 || !id.bytes().all(|c| c.is_ascii_digit()) {
        return Err(Error::Invalid("Identificador inválido".into()));
    }
    let _lock = store.acquire_lock()?;
    let mut op = store.operation(id)?;
    if op.kind != "system" {
        return Err(Error::Invalid("Tipo de operação inválido".into()));
    }
    let mut j: Journal = serde_json::from_value(op.payload.clone())?;
    validate(&j.actions)?;
    let allowed = desired(&j.actions);
    if j.after != allowed
        || j.before.keys().ne(j.after.keys())
        || j.before.values().flatten().any(|v| v.bytes.len() > 4096)
    {
        return Err(Error::Invalid("Snapshot fora do catálogo".into()));
    }
    if restore {
        if !["applied", "pending", "recovery_required", "approved"].contains(&op.status.as_str()) {
            return Err(Error::Invalid("Estado não restaurável".into()));
        }
        let current = read_all(&j.before)?;
        for (k, v) in &current {
            if Some(v) != j.before.get(k) && Some(v) != j.after.get(k) {
                return Err(Error::Invalid(
                    "Configuração mudou externamente; restauração bloqueada".into(),
                ));
            }
        }
        if current == j.before {
            op.status = "restored".into();
            op.error = None;
            store.save_operation(&op)?;
            return Ok(op);
        }
        native::restore_point()?;
        compensate(&j.before, &j.after)?;
        op.status = "restored".into();
        op.error = None;
        store.save_operation(&op)?;
        return Ok(op);
    }
    if op.status != "approved" {
        return Err(Error::Invalid(
            "A operação já foi executada ou precisa ser recuperada".into(),
        ));
    }
    if read_all(&j.before)? != j.before {
        return Err(Error::Invalid(
            "O estado mudou desde a revisão. Gere um novo plano.".into(),
        ));
    }
    let result = (|| -> Result<(), Error> {
        j.restore_point = Some(native::restore_point()?);
        op.payload = serde_json::to_value(&j)?;
        op.status = "pending".into();
        store.save_operation(&op)?;
        write_all(&j.after)
    })();
    match result {
        Ok(()) => {
            op.status = "applied".into();
            op.error = None;
            store.save_operation(&op)?;
            Ok(op)
        }
        Err(e) => {
            if op.status == "pending" {
                op.status = if compensate(&j.before, &j.after).is_ok() {
                    "rolled_back"
                } else {
                    "recovery_required"
                }
                .into();
            } else {
                op.status = "failed".into();
            }
            op.error = Some(e.to_string());
            store.save_operation(&op)?;
            Err(e)
        }
    }
}

pub fn record_failure(store: &PreferenceStore, id: &str, error: &Error) -> Result<(), Error> {
    let _lock = store.acquire_lock()?;
    let mut op = store.operation(id)?;
    if op.kind == "system" {
        if op.status == "approved" {
            op.status = "failed".into();
        }
        op.error = Some(error.to_string());
        store.save_operation(&op)?;
    }
    Ok(())
}
pub fn launch(store: &PreferenceStore, id: &str, restore: bool) -> Result<Operation, Error> {
    if let Err(error) = native::elevate(id, restore) {
        let _lock = store.acquire_lock()?;
        let mut op = store.operation(id)?;
        if op.status == "approved" {
            op.status = "cancelled".into();
            op.error = Some(error.to_string());
            store.save_operation(&op)?;
        }
        return Err(Error::Invalid(
            op.error.unwrap_or_else(|| error.to_string()),
        ));
    }
    let op = store.operation(id)?;
    if !["applied", "restored"].contains(&op.status.as_str()) {
        return Err(Error::Invalid(op.error.unwrap_or_else(|| {
            "Operação não concluída. Confira o Histórico antes de tentar novamente.".into()
        })));
    }
    Ok(op)
}
pub fn cancel(store: &PreferenceStore, id: &str) -> Result<(), Error> {
    let _lock = store.acquire_lock()?;
    let mut op = store.operation(id)?;
    if op.kind != "system" || op.status != "approved" {
        return Err(Error::Invalid(
            "Somente uma revisão ainda não executada pode ser cancelada".into(),
        ));
    }
    op.status = "cancelled".into();
    store.save_operation(&op)
}
pub fn undo(store: &PreferenceStore, id: &str) -> Result<Operation, Error> {
    let op = store.operation(id)?;
    match op.kind.as_str() {
        "system" => launch(store, id, true),
        "obs" => crate::obs::restore(store, id),
        _ => Err(Error::Invalid("Tipo de operação desconhecido".into())),
    }
}
#[cfg(not(windows))]
mod native {
    use super::*;
    fn unsupported() -> Error {
        Error::Invalid("Otimização de sistema disponível somente no Windows nesta versão".into())
    }
    pub fn read(_: &str) -> Result<Option<StoredValue>, Error> {
        Err(unsupported())
    }
    pub fn write(_: &str, _: Option<&StoredValue>) -> Result<(), Error> {
        Err(unsupported())
    }
    pub fn restore_point() -> Result<String, Error> {
        Err(unsupported())
    }
    pub fn elevate(_: &str, _: bool) -> Result<(), Error> {
        Err(unsupported())
    }
}
#[cfg(windows)]
mod native {
    use super::*;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, FreeLibrary},
        System::{
            Com::{
                CoInitializeEx, CoInitializeSecurity, CoUninitialize, COINIT_APARTMENTTHREADED,
                RPC_C_AUTHN_LEVEL_PKT_PRIVACY, RPC_C_IMP_LEVEL_IMPERSONATE,
            },
            LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32},
            SystemInformation::GetSystemDirectoryW,
            Threading::{GetExitCodeProcess, WaitForSingleObject},
        },
        UI::{
            Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW},
            WindowsAndMessaging::SW_HIDE,
        },
    };
    use winreg::{enums::*, RegKey, RegValue};
    fn location(id: &str) -> Result<(&'static str, &'static str), Error> {
        match id {
            "game_mode_auto" => Ok((r"Software\Microsoft\GameBar", "AutoGameModeEnabled")),
            "game_mode_allow" => Ok((r"Software\Microsoft\GameBar", "AllowAutoGameMode")),
            "game_dvr" => Ok((r"System\GameConfigStore", "GameDVR_Enabled")),
            "capture" => Ok((
                r"Software\Microsoft\Windows\CurrentVersion\GameDVR",
                "AppCaptureEnabled",
            )),
            "mouse_speed" => Ok((r"Control Panel\Mouse", "MouseSpeed")),
            "mouse_threshold1" => Ok((r"Control Panel\Mouse", "MouseThreshold1")),
            "mouse_threshold2" => Ok((r"Control Panel\Mouse", "MouseThreshold2")),
            _ => Err(Error::Invalid("Chave fora do catálogo".into())),
        }
    }
    fn guid(text: &str) -> bool {
        text.len() == 36
            && text.bytes().enumerate().all(|(i, c)| {
                if [8, 13, 18, 23].contains(&i) {
                    c == b'-'
                } else {
                    c.is_ascii_hexdigit()
                }
            })
    }
    fn power(args: &[&str]) -> Result<String, Error> {
        let mut directory = [0u16; 32768];
        let len =
            unsafe { GetSystemDirectoryW(directory.as_mut_ptr(), directory.len() as u32) } as usize;
        if len == 0 || len >= directory.len() {
            return Err(Error::Invalid("Diretório do sistema indisponível".into()));
        }
        let exe = std::path::PathBuf::from(String::from_utf16_lossy(&directory[..len]))
            .join("powercfg.exe");
        use std::os::windows::process::CommandExt;
        let mut child = std::process::Command::new(exe)
            .args(args)
            .creation_flags(0x08000000)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(8);
        loop {
            if child.try_wait()?.is_some() {
                break;
            }
            if std::time::Instant::now() > deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Err(Error::Invalid("Timeout do plano de energia".into()));
            }
            std::thread::sleep(std::time::Duration::from_millis(30));
        }
        let output = child.wait_with_output()?;
        if !output.status.success() {
            return Err(Error::Invalid("Windows recusou o plano de energia. O plano alto desempenho pode não existir neste hardware.".into()));
        }
        Ok(String::from_utf8_lossy(&output.stdout).into())
    }
    pub fn read(id: &str) -> Result<Option<StoredValue>, Error> {
        if id == "power_plan" {
            let output = power(&["/getactivescheme"])?;
            let selected = output
                .split_whitespace()
                .find(|w| guid(w))
                .ok_or_else(|| Error::Invalid("GUID do plano atual indisponível".into()))?;
            return Ok(Some(StoredValue {
                kind: 0,
                bytes: selected.to_ascii_lowercase().into_bytes(),
            }));
        }
        let (path, name) = location(id)?;
        let key = match RegKey::predef(HKEY_CURRENT_USER).open_subkey(path) {
            Ok(k) => k,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        match key.get_raw_value(name) {
            Ok(v)
                if v.bytes.len() <= 4096
                    && [0, 1, 2, 3, 4, 7, 11].contains(&(v.vtype.clone() as u32)) =>
            {
                Ok(Some(StoredValue {
                    kind: v.vtype as u32,
                    bytes: v.bytes,
                }))
            }
            Ok(_) => Err(Error::Invalid(
                "Valor atual não tem um formato que possa ser restaurado com segurança".into(),
            )),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
    pub fn write(id: &str, value: Option<&StoredValue>) -> Result<(), Error> {
        if id == "power_plan" {
            let v = value.ok_or_else(|| Error::Invalid("Plano anterior ausente".into()))?;
            let g = std::str::from_utf8(&v.bytes)
                .map_err(|_| Error::Invalid("GUID inválido".into()))?;
            if !guid(g) {
                return Err(Error::Invalid("GUID fora do formato permitido".into()));
            }
            power(&["/setactive", g])?;
            return Ok(());
        }
        let (path, name) = location(id)?;
        let root = RegKey::predef(HKEY_CURRENT_USER);
        match value {
            Some(v) => {
                let kind = match v.kind {
                    0 => REG_NONE,
                    1 => REG_SZ,
                    2 => REG_EXPAND_SZ,
                    3 => REG_BINARY,
                    4 => REG_DWORD,
                    7 => REG_MULTI_SZ,
                    11 => REG_QWORD,
                    _ => {
                        return Err(Error::Invalid(
                            "Tipo de registro não suportado para reversão".into(),
                        ))
                    }
                };
                root.create_subkey(path)?.0.set_raw_value(
                    name,
                    &RegValue {
                        vtype: kind,
                        bytes: v.bytes.clone(),
                    },
                )?;
            }
            None => match root.open_subkey_with_flags(path, KEY_SET_VALUE) {
                Ok(k) => match k.delete_value(name) {
                    Ok(()) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => return Err(e.into()),
                },
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            },
        }
        Ok(())
    }
    #[repr(C)]
    struct RestoreInfo {
        event: u32,
        kind: u32,
        sequence: i64,
        description: [u16; 256],
    }
    #[repr(C)]
    struct RestoreStatus {
        status: u32,
        sequence: i64,
    }
    pub fn restore_point() -> Result<String, Error> {
        unsafe {
            let hr = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
            if hr < 0 {
                return Err(Error::Invalid(
                    "Falha ao iniciar COM para restauração".into(),
                ));
            }
            let result = (|| {
                let security = CoInitializeSecurity(
                    std::ptr::null_mut(),
                    -1,
                    std::ptr::null(),
                    std::ptr::null(),
                    RPC_C_AUTHN_LEVEL_PKT_PRIVACY,
                    RPC_C_IMP_LEVEL_IMPERSONATE,
                    std::ptr::null(),
                    0,
                    std::ptr::null(),
                );
                if security < 0 {
                    return Err(Error::Invalid(
                        "Falha na segurança COM para restauração".into(),
                    ));
                }
                let dll: Vec<u16> = "srclient.dll\0".encode_utf16().collect();
                let library = LoadLibraryExW(
                    dll.as_ptr(),
                    std::ptr::null_mut(),
                    LOAD_LIBRARY_SEARCH_SYSTEM32,
                );
                if library.is_null() {
                    return Err(Error::Invalid("System Restore indisponível".into()));
                }
                let result = (|| {
                    let proc = GetProcAddress(library, c"SRSetRestorePointW".as_ptr().cast())
                        .ok_or_else(|| Error::Invalid("API de restauração indisponível".into()))?;
                    let call: unsafe extern "system" fn(
                        *mut RestoreInfo,
                        *mut RestoreStatus,
                    ) -> i32 = std::mem::transmute(proc);
                    let mut info = RestoreInfo {
                        event: 100,
                        kind: 12,
                        sequence: 0,
                        description: [0; 256],
                    };
                    for (i, c) in "GameForge AI - antes da otimização"
                        .encode_utf16()
                        .enumerate()
                    {
                        info.description[i] = c;
                    }
                    let mut status = RestoreStatus {
                        status: 0,
                        sequence: 0,
                    };
                    if call(&mut info, &mut status) == 0
                        || status.status != 0
                        || status.sequence <= 0
                    {
                        return Err(Error::Invalid(format!("Ponto de Restauração não criado ({}). Ative a Proteção do Sistema; nenhuma otimização foi aplicada.",status.status)));
                    }
                    info.event = 101;
                    info.sequence = status.sequence;
                    if call(&mut info, &mut status) == 0 || status.status != 0 {
                        return Err(Error::Invalid(
                            "Falha ao concluir Ponto de Restauração; nenhuma otimização aplicada"
                                .into(),
                        ));
                    }
                    Ok(info.sequence.to_string())
                })();
                FreeLibrary(library);
                result
            })();
            CoUninitialize();
            result
        }
    }
    pub fn elevate(id: &str, restore: bool) -> Result<(), Error> {
        if id.is_empty() || id.len() > 32 || !id.bytes().all(|c| c.is_ascii_digit()) {
            return Err(Error::Invalid("Identificador inválido".into()));
        }
        let exe = std::env::current_exe()?;
        use std::os::windows::ffi::OsStrExt;
        let exe: Vec<u16> = exe.as_os_str().encode_wide().chain(Some(0)).collect();
        let verb: Vec<u16> = "runas\0".encode_utf16().collect();
        let args: Vec<u16> = format!(
            "--system-helper {id} {}\0",
            if restore { "restore" } else { "apply" }
        )
        .encode_utf16()
        .collect();
        unsafe {
            let mut execute: SHELLEXECUTEINFOW = std::mem::zeroed();
            execute.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            execute.fMask = SEE_MASK_NOCLOSEPROCESS;
            execute.lpVerb = verb.as_ptr();
            execute.lpFile = exe.as_ptr();
            execute.lpParameters = args.as_ptr();
            execute.nShow = SW_HIDE;
            if ShellExecuteExW(&mut execute) == 0 {
                return Err(Error::Invalid(
                    "Elevação cancelada ou não autorizada. Nenhuma ação foi iniciada.".into(),
                ));
            }
            if execute.hProcess.is_null() {
                return Err(Error::Invalid("Processo elevado indisponível".into()));
            }
            let wait = WaitForSingleObject(execute.hProcess, 300000);
            let mut exit = 1;
            let got = GetExitCodeProcess(execute.hProcess, &mut exit);
            CloseHandle(execute.hProcess);
            if wait != 0 || got == 0 {
                return Err(Error::Invalid("Operação elevada ainda não confirmada. Confira o Histórico antes de tentar novamente.".into()));
            }
            if exit != 0 {
                return Err(Error::Invalid(
                    "O helper não concluiu a operação. Veja o erro no Histórico.".into(),
                ));
            }
            Ok(())
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    struct Fake {
        values: std::cell::RefCell<BTreeMap<String, Option<StoredValue>>>,
        fail: std::cell::Cell<Option<usize>>,
        writes: std::cell::Cell<usize>,
    }
    impl Backend for Fake {
        fn read(&self, key: &str) -> Result<Option<StoredValue>, Error> {
            Ok(self.values.borrow().get(key).cloned().flatten())
        }
        fn write(&self, key: &str, value: Option<&StoredValue>) -> Result<(), Error> {
            let n = self.writes.get();
            self.writes.set(n + 1);
            if self.fail.get() == Some(n) {
                self.fail.set(None);
                return Err(Error::Invalid("injected failure".into()));
            }
            self.values.borrow_mut().insert(key.into(), value.cloned());
            Ok(())
        }
    }
    #[test]
    fn each_catalog_action_roundtrip() {
        for action in [
            SystemAction::EnableGameMode,
            SystemAction::DisableGameCapture,
            SystemAction::DisableMouseAcceleration,
            SystemAction::HighPerformancePower,
        ] {
            let after = desired(&[action]);
            let before = after
                .keys()
                .map(|k| (k.clone(), None))
                .collect::<BTreeMap<_, _>>();
            let b = Fake {
                values: std::cell::RefCell::new(before.clone()),
                fail: std::cell::Cell::new(None),
                writes: std::cell::Cell::new(0),
            };
            write_using(&b, &after).expect("apply");
            assert_eq!(*b.values.borrow(), after);
            compensate_using(&b, &before, &after).expect("undo");
            assert_eq!(*b.values.borrow(), before);
        }
    }
    #[test]
    fn intermediate_failure_compensates_and_conflict_does_not_overwrite() {
        let after = desired(&[
            SystemAction::EnableGameMode,
            SystemAction::DisableGameCapture,
        ]);
        let before = after
            .keys()
            .map(|k| (k.clone(), None))
            .collect::<BTreeMap<_, _>>();
        let b = Fake {
            values: std::cell::RefCell::new(before.clone()),
            fail: std::cell::Cell::new(Some(2)),
            writes: std::cell::Cell::new(0),
        };
        assert!(write_using(&b, &after).is_err());
        compensate_using(&b, &before, &after).expect("rollback");
        assert_eq!(*b.values.borrow(), before);
        b.values.borrow_mut().insert(
            "capture".into(),
            Some(StoredValue {
                kind: 4,
                bytes: 99u32.to_le_bytes().to_vec(),
            }),
        );
        let external = b.values.borrow().clone();
        assert!(compensate_using(&b, &before, &after).is_err());
        assert_eq!(*b.values.borrow(), external);
    }
    #[test]
    fn closed_catalog_and_reversible_values() {
        let d = desired(&[
            SystemAction::EnableGameMode,
            SystemAction::DisableMouseAcceleration,
        ]);
        assert_eq!(d.len(), 4);
        assert_eq!(
            d["mouse_speed"].as_ref().expect("value").bytes,
            vec![48, 0, 0, 0]
        );
        assert_eq!(d["game_mode_auto"].as_ref().expect("value").kind, 4);
        assert!(validate(&[]).is_err());
        assert!(validate(&[SystemAction::EnableGameMode, SystemAction::EnableGameMode]).is_err());
    }
}
