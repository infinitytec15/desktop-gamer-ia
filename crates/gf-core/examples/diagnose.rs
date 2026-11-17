fn main() {
    let start = std::time::Instant::now();
    let r = gf_core::diagnostics::diagnose();
    println!(
        "os={} cores={} memory_gb={:.1} disks={} sensors={} elapsed_ms={}",
        r.os,
        r.logical_cores,
        r.memory_gb.unwrap_or_default(),
        r.disks.len(),
        r.sensors.len(),
        start.elapsed().as_millis()
    );
}
