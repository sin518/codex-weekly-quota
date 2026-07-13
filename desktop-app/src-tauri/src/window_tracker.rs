use tauri::{AppHandle, Manager, PhysicalPosition};
use std::thread;
use std::time::Duration;

const OVERLAY_WIDTH: i32 = 300;
const HEADER_OFFSET_Y: i32 = 4;

#[derive(Debug, Clone, Copy)]
struct TargetWindow {
    x: i32,
    y: i32,
    width: i32,
    minimized: bool,
}

pub fn start(app: AppHandle) {
    thread::spawn(move || {
        let mut has_tracked_codex = false;
        loop {
            if let Some(overlay) = app.get_webview_window("quota-overlay") {
                match find_codex_window() {
                Some(target) if !target.minimized && target.width > OVERLAY_WIDTH => {
                    let x = target.x + (target.width - OVERLAY_WIDTH) / 2;
                    let y = target.y + HEADER_OFFSET_Y;
                    let _ = overlay.set_position(PhysicalPosition::new(x, y));
                    let _ = overlay.show();
                    has_tracked_codex = true;
                }
                Some(_) => {
                    let _ = overlay.hide();
                }
                None if has_tracked_codex => {
                    // A previously tracked Codex window disappeared or was minimized.
                    let _ = overlay.hide();
                }
                None => {
                    // First-launch fallback: missing Accessibility/Automation permission must not
                    // make the app look broken. Keep the capsule visible at the top of the primary
                    // display until window tracking becomes available.
                    if let Ok(Some(monitor)) = overlay.primary_monitor() {
                        let monitor_position = monitor.position();
                        let monitor_size = monitor.size();
                        let x = monitor_position.x
                            + (monitor_size.width as i32 - OVERLAY_WIDTH) / 2;
                        let y = monitor_position.y + 44;
                        let _ = overlay.set_position(PhysicalPosition::new(x, y));
                    }
                    let _ = overlay.show();
                }
                }
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
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
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
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
