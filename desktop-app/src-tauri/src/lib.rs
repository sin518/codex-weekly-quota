mod quota;
mod window_tracker;

use tauri::Manager;

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
            quota::get_weekly_quota,
            window_tracker::begin_overlay_drag,
            window_tracker::end_overlay_drag
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
