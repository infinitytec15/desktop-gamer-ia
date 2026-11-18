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
    #[ts(type = "number")]
    pub timestamp_ms: u64,
    pub per_core_usage: Vec<f32>,
    #[ts(type = "number")]
    pub cpu_frequency_mhz: u64,
    pub swap_used_gb: f64,
    pub swap_total_gb: f64,
    #[ts(type = "number")]
    pub uptime_seconds: u64,
    pub network_receive_mbps: f64,
    pub network_transmit_mbps: f64,
    pub disks: Vec<DiskReport>,
    pub sensors: Vec<Sensor>,
    pub gpus: Vec<crate::telemetry::GpuMetrics>,
    #[ts(type = "number")]
    pub hardware_sampled_at_ms: u64,
    pub warnings: Vec<String>,
}
pub struct Monitor {
    system: System,
    networks: sysinfo::Networks,
    components: Components,
    previous: std::time::Instant,
    hardware_at: Option<std::time::Instant>,
    hardware_timestamp: u64,
    hardware: crate::telemetry::HardwareReadings,
    disks: Vec<DiskReport>,
}
impl Default for Monitor {
    fn default() -> Self {
        Self {
            system: System::new_all(),
            networks: sysinfo::Networks::new_with_refreshed_list(),
            components: Components::new_with_refreshed_list(),
            previous: std::time::Instant::now(),
            hardware_at: None,
            hardware_timestamp: 0,
            hardware: crate::telemetry::HardwareReadings::default(),
            disks: Vec::new(),
        }
    }
}
impl Monitor {
    pub fn sample(&mut self) -> Metrics {
        let now = std::time::Instant::now();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|v| v.as_millis() as u64)
            .unwrap_or(0);
        self.system.refresh_cpu_usage();
        self.system.refresh_cpu_frequency();
        self.system.refresh_memory();
        self.networks.refresh(true);
        let seconds = now.duration_since(self.previous).as_secs_f64().max(0.05);
        self.previous = now;
        let received = self
            .networks
            .values()
            .map(|n| n.received() as f64)
            .sum::<f64>()
            * 8.
            / seconds
            / 1_000_000.;
        let sent = self
            .networks
            .values()
            .map(|n| n.transmitted() as f64)
            .sum::<f64>()
            * 8.
            / seconds
            / 1_000_000.;
        if self
            .hardware_at
            .is_none_or(|at| now.duration_since(at).as_secs() >= 3)
        {
            self.components.refresh(true);
            self.hardware = crate::telemetry::hardware();
            self.hardware_at = Some(now);
            self.hardware_timestamp = timestamp;
            self.disks = Disks::new_with_refreshed_list()
                .iter()
                .map(|d| DiskReport {
                    name: d.name().to_string_lossy().into(),
                    total_gb: d.total_space() as f64 / 1073741824.,
                    available_gb: d.available_space() as f64 / 1073741824.,
                    kind: format!("{:?}", d.kind()),
                })
                .collect();
        }
        let mut sensors = self
            .components
            .iter()
            .map(|c| Sensor {
                name: c.label().into(),
                temperature: c.temperature(),
            })
            .collect::<Vec<_>>();
        sensors.extend(self.hardware.sensors.clone());
        let mut warnings = Vec::new();
        if sensors.is_empty() {
            warnings.push("Temperatura de CPU/placa-mãe não exposta. Para sensores adicionais, use o provedor WMI do LibreHardwareMonitor; ele não é instalado automaticamente.".into());
        }
        if self.hardware.gpus.is_empty() {
            warnings.push(
                "Driver não expôs métricas de GPU via NVIDIA NVSMI ou contadores Windows WDDM."
                    .into(),
            );
        }
        Metrics {
            cpu_usage: self.system.global_cpu_usage(),
            memory_used_gb: self.system.used_memory() as f64 / 1073741824.,
            memory_total_gb: self.system.total_memory() as f64 / 1073741824.,
            timestamp_ms: timestamp,
            per_core_usage: self.system.cpus().iter().map(|c| c.cpu_usage()).collect(),
            cpu_frequency_mhz: self
                .system
                .cpus()
                .iter()
                .map(|c| c.frequency())
                .max()
                .unwrap_or(0),
            swap_used_gb: self.system.used_swap() as f64 / 1073741824.,
            swap_total_gb: self.system.total_swap() as f64 / 1073741824.,
            uptime_seconds: System::uptime(),
            network_receive_mbps: received,
            network_transmit_mbps: sent,
            disks: self.disks.clone(),
            sensors,
            gpus: self.hardware.gpus.clone(),
            hardware_sampled_at_ms: self.hardware_timestamp,
            warnings,
        }
    }
}
