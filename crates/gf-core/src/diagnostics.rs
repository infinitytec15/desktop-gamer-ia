use serde::{Deserialize, Serialize};
use sysinfo::{Components, Disks, System};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct DiskReport {
    pub name: String,
    pub total_gb: f64,
    pub available_gb: f64,
    pub kind: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct ProcessReport {
    pub name: String,
    pub memory_mb: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct Sensor {
    pub name: String,
    pub temperature: Option<f32>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct Report {
    pub os: String,
    pub arch: String,
    pub cpu: String,
    pub logical_cores: u32,
    pub memory_gb: Option<f64>,
    pub memory_used_gb: f64,
    pub cpu_usage: f32,
    pub disks: Vec<DiskReport>,
    pub processes: Vec<ProcessReport>,
    pub sensors: Vec<Sensor>,
    pub warnings: Vec<String>,
    pub source: String,
}
pub fn diagnose() -> Report {
    let mut s = System::new_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    s.refresh_cpu_usage();
    let disks = Disks::new_with_refreshed_list()
        .iter()
        .map(|d| DiskReport {
            name: d.name().to_string_lossy().into(),
            total_gb: d.total_space() as f64 / 1073741824.,
            available_gb: d.available_space() as f64 / 1073741824.,
            kind: format!("{:?}", d.kind()),
        })
        .collect::<Vec<_>>();
    let mut processes = s
        .processes()
        .values()
        .map(|p| ProcessReport {
            name: p.name().to_string_lossy().into(),
            memory_mb: p.memory() as f64 / 1048576.,
        })
        .collect::<Vec<_>>();
    processes.sort_by(|a, b| b.memory_mb.total_cmp(&a.memory_mb));
    processes.truncate(8);
    let sensors = Components::new_with_refreshed_list()
        .iter()
        .map(|c| Sensor {
            name: c.label().into(),
            temperature: c.temperature(),
        })
        .collect();
    let mut warnings = vec!["GPU, drivers, SMART, XMP e monitores ainda não são coletados.".into()];
    for d in &disks {
        if d.total_gb > 0. && d.available_gb / d.total_gb < 0.1 {
            warnings.push(format!(
                "Disco {} com menos de 10% de espaço livre.",
                d.name
            ));
        }
    }
    if s.total_memory() > 0 && s.used_memory() as f64 / s.total_memory() as f64 > 0.9 {
        warnings.push("Uso de memória acima de 90%.".into());
    }
    Report {
        os: System::long_os_version().unwrap_or_else(|| std::env::consts::OS.into()),
        arch: std::env::consts::ARCH.into(),
        cpu: s
            .cpus()
            .first()
            .map(|c| c.brand().into())
            .unwrap_or_else(|| "Indisponível".into()),
        logical_cores: s.cpus().len() as u32,
        memory_gb: Some(s.total_memory() as f64 / 1073741824.),
        memory_used_gb: s.used_memory() as f64 / 1073741824.,
        cpu_usage: s.global_cpu_usage(),
        disks,
        processes,
        sensors,
        warnings,
        source: "native".into(),
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct Metrics {
    pub cpu_usage: f32,
    pub memory_used_gb: f64,
    pub memory_total_gb: f64,
}
pub struct Monitor {
    system: System,
}
impl Default for Monitor {
    fn default() -> Self {
        Self {
            system: System::new_all(),
        }
    }
}
impl Monitor {
    pub fn sample(&mut self) -> Metrics {
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        Metrics {
            cpu_usage: self.system.global_cpu_usage(),
            memory_used_gb: self.system.used_memory() as f64 / 1073741824.,
            memory_total_gb: self.system.total_memory() as f64 / 1073741824.,
        }
    }
}
