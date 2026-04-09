mod audio;
mod commands;
mod error;
mod export;
mod markers;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::open_file_dialog,
            commands::play,
            commands::pause,
            commands::seek,
            commands::step_forward,
            commands::step_backward,
            commands::set_speed,
            commands::set_loop,
            commands::get_playback_position,
            commands::add_marker,
            commands::delete_marker,
            commands::move_marker,
            commands::rename_segment,
            commands::list_markers,
            commands::validate_markers,
            commands::export_audio_segments,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
