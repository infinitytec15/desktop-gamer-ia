fn main() {
    let mut monitor = gf_core::diagnostics::Monitor::default();
    let _ = monitor.sample();
    std::thread::sleep(std::time::Duration::from_secs(1));
    let sample = monitor.sample();
    println!(
        "{}",
        serde_json::json!({"cpu_usage":sample.cpu_usage,"logical_cores":sample.per_core_usage.len(),"ram_total_gb":sample.memory_total_gb,"gpus":sample.gpus,"sensor_count":sample.sensors.len(),"disk_count":sample.disks.len(),"warnings":sample.warnings})
    );
}
