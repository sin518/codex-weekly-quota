use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewWindow};

const OVERLAY_WIDTH: i32 = 360;
const HEADER_OFFSET_Y: i32 = 4;
const SNAP_DISTANCE_Y: i32 = 72;
const EDGE_PADDING: i32 = 8;

#[derive(Debug)]
struct TrackingMode {
    dragging: bool,
    attached: bool,
    offset_x: i32,
}

#[derive(Clone, Debug)]
pub struct WindowTrackerState(Arc<Mutex<TrackingMode>>);

impl Default for WindowTrackerState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(TrackingMode {
            dragging: false,
            attached: true,
            offset_x: 0,
        })))
    }
}

#[derive(Debug, Clone, Copy)]
struct TargetWindow {
    x: i32,
    y: i32,
    width: i32,
    minimized: bool,
}

pub fn start(app: AppHandle, state: WindowTrackerState) {
    thread::spawn(move || {
        let mut has_tracked_codex = false;
        let mut overlay_visible = None;
        loop {
            if let Some(overlay) = app.get_webview_window("quota-overlay") {
                let (dragging, attached, offset_x) = state
                    .0
                    .lock()
                    .map(|mode| (mode.dragging, mode.attached, mode.offset_x))
                    .unwrap_or((false, true, 0));

                if dragging {
                    thread::sleep(Duration::from_millis(50));
                    continue;
                }

                match find_codex_window() {
                    Some(target) if !target.minimized && target.width > OVERLAY_WIDTH => {
                        if attached {
                            let centered_x = target.x + (target.width - OVERLAY_WIDTH) / 2;
                            let x = clamp_to_target(centered_x + offset_x, target);
                            let y = target.y + HEADER_OFFSET_Y;
                            let _ = overlay.set_position(PhysicalPosition::new(x, y));
                        }
                        set_overlay_visibility(&overlay, true, &mut overlay_visible);
                        has_tracked_codex = true;
                    }
                    Some(_) => {
                        if attached {
                            set_overlay_visibility(&overlay, false, &mut overlay_visible);
                        }
                    }
                    None if has_tracked_codex => {
                        if attached {
                            set_overlay_visibility(&overlay, false, &mut overlay_visible);
                        }
                    }
                    None => {
                        // Keep first launch visible even when Accessibility permission is missing.
                        if attached {
                            if let Ok(Some(monitor)) = overlay.primary_monitor() {
                                let monitor_position = monitor.position();
                                let monitor_size = monitor.size();
                                let x = monitor_position.x
                                    + (monitor_size.width as i32 - OVERLAY_WIDTH) / 2;
                                let y = monitor_position.y + 44;
                                let _ = overlay.set_position(PhysicalPosition::new(x, y));
                            }
                        }
                        set_overlay_visibility(&overlay, true, &mut overlay_visible);
                    }
                }
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
}

fn set_overlay_visibility(
    overlay: &WebviewWindow,
    visible: bool,
    previous_visibility: &mut Option<bool>,
) {
    if visible {
        let _ = overlay.show();
    } else {
        let _ = overlay.hide();
    }

    if *previous_visibility != Some(visible) {
        let _ = overlay.emit("overlay-visibility-changed", visible);
        *previous_visibility = Some(visible);
    }
}

#[tauri::command]
pub fn begin_overlay_drag(state: State<'_, WindowTrackerState>) {
    if let Ok(mut mode) = state.0.lock() {
        mode.dragging = true;
    }
}

#[tauri::command]
pub fn end_overlay_drag(app: AppHandle, state: State<'_, WindowTrackerState>) {
    let overlay = app.get_webview_window("quota-overlay");
    let current_position = overlay.as_ref().and_then(|window| window.outer_position().ok());
    let target = find_codex_window();

    if let Ok(mut mode) = state.0.lock() {
        mode.dragging = false;

        let Some(position) = current_position else {
            return;
        };
        let Some(target) = target.filter(|target| !target.minimized) else {
            mode.attached = false;
            return;
        };

        let header_y = target.y + HEADER_OFFSET_Y;
        let overlaps_horizontally = position.x + OVERLAY_WIDTH >= target.x - EDGE_PADDING
            && position.x <= target.x + target.width + EDGE_PADDING;
        let close_to_header = (position.y - header_y).abs() <= SNAP_DISTANCE_Y;

        if overlaps_horizontally && close_to_header && target.width > OVERLAY_WIDTH {
            let snapped_x = clamp_to_target(position.x, target);
            let centered_x = target.x + (target.width - OVERLAY_WIDTH) / 2;
            mode.attached = true;
            mode.offset_x = snapped_x - centered_x;
            if let Some(overlay) = overlay {
                let _ = overlay.set_position(PhysicalPosition::new(snapped_x, header_y));
            }
        } else {
            mode.attached = false;
        }
    }
}

fn clamp_to_target(x: i32, target: TargetWindow) -> i32 {
    let min_x = target.x + EDGE_PADDING;
    let max_x = target.x + target.width - OVERLAY_WIDTH - EDGE_PADDING;
    x.clamp(min_x, max_x.max(min_x))
}

#[cfg(target_os = "macos")]
fn find_codex_window() -> Option<TargetWindow> {
    use std::process::Command;

    let script = r#"
tell application "System Events"
  if not (exists process "ChatGPT") then return ""
  tell process "ChatGPT"
    if (count of windows) is 0 then return ""
    set p to position of front window
    set s to size of front window
    set isMinimized to value of attribute "AXMinimized" of front window
    return (item 1 of p as text) & "," & (item 2 of p as text) & "," & (item 1 of s as text) & "," & isMinimized
  end tell
end tell
"#;

    let output = Command::new("osascript").args(["-e", script]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let raw = String::from_utf8(output.stdout).ok()?;
    let values: Vec<&str> = raw.trim().split(',').collect();
    if values.len() != 4 {
        return None;
    }

    Some(TargetWindow {
        x: values[0].trim().parse().ok()?,
        y: values[1].trim().parse().ok()?,
        width: values[2].trim().parse().ok()?,
        minimized: values[3].trim() == "true",
    })
}

#[cfg(target_os = "windows")]
fn find_codex_window() -> Option<TargetWindow> {
    use std::sync::Mutex;
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowRect, GetWindowTextLengthW, GetWindowTextW, IsIconic,
        IsWindowVisible,
    };

    static RESULT: Mutex<Option<TargetWindow>> = Mutex::new(None);

    unsafe extern "system" fn visit(hwnd: HWND, _: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let length = GetWindowTextLengthW(hwnd);
        if length <= 0 {
            return 1;
        }
        let mut title = vec![0u16; length as usize + 1];
        GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32);
        let title = String::from_utf16_lossy(&title).to_lowercase();
        if !title.contains("codex") && !title.contains("chatgpt") {
            return 1;
        }
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return 1;
        }
        if let Ok(mut result) = RESULT.lock() {
            *result = Some(TargetWindow {
                x: rect.left,
                y: rect.top,
                width: rect.right - rect.left,
                minimized: IsIconic(hwnd) != 0,
            });
        }
        0
    }

    if let Ok(mut result) = RESULT.lock() {
        *result = None;
    }
    unsafe { EnumWindows(Some(visit), 0) };
    RESULT.lock().ok().and_then(|result| *result)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn find_codex_window() -> Option<TargetWindow> {
    None
}
