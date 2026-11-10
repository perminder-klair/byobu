// Compiles the screens in ui/ into Rust, so a mistake in one is a build error.
fn main() {
    slint_build::compile("ui/panel.slint").expect("ui/panel.slint didn't compile");
}
