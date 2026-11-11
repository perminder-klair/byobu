// Slint turns the picture for SLINT_KMS_ROTATION but leaves the touchscreen as it is, so on a
// rotated panel every touch lands on the wrong axis. libinput can turn a touchscreen's own
// coordinates with a calibration matrix, which this sets inside the panel's process only, leaving
// the system's setup alone for anything else that reads the screen, like cage.
#[cfg(feature = "kms")]
pub fn follow_rotation() -> Result<(), slint::PlatformError> {
    use input::event::touch::TouchEventPosition;
    use input::event::{DeviceEvent, Event, EventTrait, TouchEvent};

    let rotation = std::env::var("SLINT_KMS_ROTATION").unwrap_or_default();
    let matrix = matrix(&rotation);
    // BYOBU_TOUCHES says where each touch lands on a 1280 by 720 screen, for checking the turn.
    let report = std::env::var_os("BYOBU_TOUCHES").is_some();
    if matrix.is_none() && !report {
        return Ok(());
    }
    slint::BackendSelector::new()
        .with_libinput_event_hook(move |event| {
            match event {
                Event::Device(DeviceEvent::Added(added)) => {
                    let mut device = added.device();
                    if let Some(matrix) = matrix.filter(|_| device.config_calibration_has_matrix()) {
                        let _ = device.config_calibration_set_matrix(matrix);
                    }
                }
                Event::Touch(TouchEvent::Down(down)) if report => {
                    eprintln!("Touch at {:.0}, {:.0}", down.x_transformed(1280), down.y_transformed(720));
                }
                _ => {}
            }
            // Every event still goes on to Slint.
            false
        })
        .select()
}

#[cfg(not(feature = "kms"))]
pub fn follow_rotation() -> Result<(), slint::PlatformError> {
    Ok(())
}

// Slint turns the picture clockwise, so a touch is turned back the other way: the first row gives
// x from the touchscreen's x and y, the second gives y, each with an offset.
#[cfg_attr(not(feature = "kms"), allow(dead_code))]
fn matrix(rotation: &str) -> Option<[f32; 6]> {
    match rotation.trim() {
        "90" => Some([0.0, 1.0, 0.0, -1.0, 0.0, 1.0]),
        "180" => Some([-1.0, 0.0, 1.0, 0.0, -1.0, 1.0]),
        "270" => Some([0.0, -1.0, 1.0, 1.0, 0.0, 0.0]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn turn(rotation: &str, x: f32, y: f32) -> (f32, f32) {
        let m = matrix(rotation).unwrap();
        (m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5])
    }

    #[test]
    fn a_turn_and_its_opposite_cancel_out() {
        // Where Slint draws the screen's top left corner when it turns the picture clockwise:
        // at 90 that's the touchscreen's top right, which has to come back as the top left.
        assert_eq!(turn("90", 1.0, 0.0), (0.0, 0.0));
        assert_eq!(turn("180", 1.0, 1.0), (0.0, 0.0));
        assert_eq!(turn("270", 0.0, 1.0), (0.0, 0.0));
        assert_eq!(matrix("0"), None);
    }
}
