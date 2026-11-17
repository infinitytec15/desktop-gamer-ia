fn main() {
    let inventory = gf_core::inventory::scan();
    println!(
        "programs={} warnings={}",
        inventory.apps.len(),
        inventory.warnings.len()
    );
}
