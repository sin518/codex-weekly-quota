mod quota;
mod window_tracker;

use tauri::Manager;

#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    let settings = app
        .get_webview_window("settings")
        .ok_or_else(|| "找不到设置窗口".to_string())?;

    settings
        .unminimize()
        .map_err(|error| format!("恢复设置窗口失败：{error}"))?;
    settings
        .show()
        .map_err(|error| format!("显示设置窗口失败：{error}"))?;
    settings
        .center()
        .map_err(|error| format!("居中设置窗口失败：{error}"))?;
    settings
        .set_focus()
        .map_err(|error| format!("聚焦设置窗口失败：{error}"))?;

    Ok(())
}

#[tauri::command]
fn close_settings(app: tauri::AppHandle) -> Result<(), String> {
    let settings = app
        .get_webview_window("settings")
        .ok_or_else(|| "找不到设置窗口".to_string())?;

    settings
        .hide()
        .map_err(|error| format!("关闭设置窗口失败：{error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tracker_state = window_tracker::WindowTrackerState::default();
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(tracker_state)
        .setup(|app| {
            let state = app
                .state::<window_tracker::WindowTrackerState>()
                .inner()
                .clone();
            window_tracker::start(app.handle().clone(), state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_settings,
            close_settings,
            quota::get_weekly_quota,
            window_tracker::begin_overlay_drag,
            window_tracker::end_overlay_drag
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
