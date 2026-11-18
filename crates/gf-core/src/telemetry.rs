use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/desktop/src/generated/")]
pub struct GpuMetrics {
    pub name: String,
    pub usage_percent: Option<f64>,
    pub temperature_c: Option<f64>,
    pub memory_used_mb: Option<f64>,
    pub memory_total_mb: Option<f64>,
    pub power_w: Option<f64>,
    pub source: String,
}
fn numeric(value: &str, min: f64, max: f64) -> Option<f64> {
    value
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v >= min && *v <= max)
}
pub fn parse_nvidia(text: &str) -> Vec<GpuMetrics> {
    text.lines()
        .take(8)
        .filter_map(|line| {
            let fields: Vec<_> = line.split(',').map(str::trim).collect();
            if fields.len() != 6 || fields[0].is_empty() {
                return None;
            }
            Some(GpuMetrics {
                name: fields[0].chars().take(150).collect(),
                usage_percent: numeric(fields[1], 0., 100.),
                temperature_c: numeric(fields[2], -20., 150.),
                memory_used_mb: numeric(fields[3], 0., 1_000_000.),
                memory_total_mb: numeric(fields[4], 0., 1_000_000.),
                power_w: numeric(fields[5], 0., 5000.),
                source: "NVIDIA NVSMI".into(),
            })
        })
        .collect()
}
#[derive(Default, Deserialize)]
pub struct HardwareReadings {
    #[serde(default)]
    pub gpus: Vec<GpuMetrics>,
    #[serde(default)]
    pub sensors: Vec<crate::diagnostics::Sensor>,
}
#[cfg(windows)]
fn run(exe: std::path::PathBuf, args: &[&str]) -> Option<String> {
    use std::{
        os::windows::process::CommandExt,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    let mut child = Command::new(exe)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(0x08000000)
        .spawn()
        .ok()?;
    let deadline = Instant::now() + Duration::from_millis(1800);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {}
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let output = child.wait_with_output().ok()?;
    if !output.status.success() || output.stdout.len() > 131072 {
        return None;
    }
    Some(
        String::from_utf8_lossy(&output.stdout)
            .trim_start_matches('\u{feff}')
            .into(),
    )
}
pub fn hardware() -> HardwareReadings {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::GetSystemDirectoryW;
        let mut path = [0u16; 32768];
        let len = unsafe { GetSystemDirectoryW(path.as_mut_ptr(), path.len() as u32) } as usize;
        if len == 0 || len >= path.len() {
            return HardwareReadings::default();
        }
        let system = std::path::PathBuf::from(String::from_utf16_lossy(&path[..len]));
        let mut result = HardwareReadings::default();
        if let Some(csv)=run(system.join("nvidia-smi.exe"),&["--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw","--format=csv,noheader,nounits"]){result.gpus=parse_nvidia(&csv);}
        // Fixed read-only queries. No user/model text is interpolated into this command.
        const SCRIPT: &str = r#"$ErrorActionPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$s=@(Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor | Where-Object SensorType -eq 'Temperature' | Select-Object -First 24 | ForEach-Object { @{name=('LHM: '+$_.Name);temperature=[double]$_.Value} });$g=@();$a=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | Select-Object -First 8);$e=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine);foreach($v in $a){$n=$v.Name;$u=$e | Where-Object {$_.Name -like ('*'+$n+'*')} | Group-Object {$_.Name -replace '^pid_\d+_',''} | ForEach-Object {($_.Group | Measure-Object UtilizationPercentage -Sum).Sum} | Measure-Object -Maximum;$g+=@{name=('GPU WDDM '+$g.Count);usage_percent=$(if($null -ne $u.Maximum){[Math]::Min(100,[double]$u.Maximum)}else{$null});temperature_c=$null;memory_used_mb=([double]$v.DedicatedUsage/1048576);memory_total_mb=$null;power_w=$null;source='Windows WDDM: motor mais ocupado'}};@{gpus=$g;sensors=$s}|ConvertTo-Json -Depth 4 -Compress"#;
        if let Some(json) = run(
            system.join("WindowsPowerShell/v1.0/powershell.exe"),
            &["-NoProfile", "-NonInteractive", "-Command", SCRIPT],
        ) {
            if let Ok(mut readings) = serde_json::from_str::<HardwareReadings>(&json) {
                readings.sensors.retain(|s| {
                    s.temperature
                        .is_some_and(|t| t.is_finite() && (-20.0..=150.0).contains(&t))
                });
                result.sensors = readings.sensors;
                if result.gpus.is_empty() {
                    result.gpus = readings.gpus;
                }
            }
        }
        result
    }
    #[cfg(not(windows))]
    {
        HardwareReadings::default()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nvidia_missing_values_are_not_zero_temperature() {
        let g = parse_nvidia(
            "Fixture GPU, 52, 68, 1024, 8192, 120\nMissing, N/A, N/A, [Not Supported], 4096, N/A",
        );
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].usage_percent, Some(52.));
        assert_eq!(g[1].temperature_c, None);
        assert_eq!(g[1].memory_used_mb, None);
        assert!(parse_nvidia("bad line").is_empty());
    }
}
