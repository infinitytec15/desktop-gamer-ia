fn main() {
    // Read-only. Never prepare/apply/restore or invoke elevation from this example.
    for check in gf_core::system::checks() {
        println!(
            "{:?}: {} | {} | {}",
            check.action, check.state, check.current, check.detail
        );
    }
}
