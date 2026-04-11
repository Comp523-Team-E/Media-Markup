use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::audio::{AudioEngine, FileMetadata};
use crate::error::{AppError, Result};
use crate::export::export_segments;
use crate::markers::{Marker, MarkerKind, Segment};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Playback position struct returned by get_playback_position
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackPosition {
    pub position_ms: f64,
    pub is_playing: bool,
    pub duration_ms: f64,
}

// ---------------------------------------------------------------------------
// File / engine lifecycle
// ---------------------------------------------------------------------------

/// Open a media file at the given absolute path. Returns file metadata.
/// Replaces any previously loaded file.
#[tauri::command]
pub async fn open_file(
    path: String,
    state: State<'_, AppState>,
) -> Result<FileMetadata> {
    let engine = AudioEngine::open(&path)?;
    let metadata = engine.metadata.clone();
    *state.engine.lock() = Some(engine);
    // Clear markers when a new file is loaded.
    *state.markers.lock() = crate::markers::MarkerStore::new();
    Ok(metadata)
}

/// Show the native file-open dialog, then open the chosen file.
#[tauri::command]
pub async fn open_file_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<FileMetadata> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .add_filter("Audio / Video", &["mp3", "mp4", "wav", "flac", "ogg", "aac", "m4a"])
        .blocking_pick_file()
        .ok_or(AppError::DialogCancelled)?;

    let path_str = path.to_string();

    open_file(path_str, state).await
}

// ---------------------------------------------------------------------------
// Playback control
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn play(state: State<'_, AppState>) -> Result<()> {
    state
        .engine
        .lock()
        .as_ref()
        .ok_or(AppError::NoFileLoaded)?
        .play()
}

#[tauri::command]
pub async fn pause(state: State<'_, AppState>) -> Result<()> {
    state
        .engine
        .lock()
        .as_ref()
        .ok_or(AppError::NoFileLoaded)?
        .pause()
}

#[tauri::command]
pub async fn seek(state: State<'_, AppState>, position_ms: u64) -> Result<()> {
    let engine = state.engine.lock();
    let engine = engine.as_ref().ok_or(AppError::NoFileLoaded)?;
    let duration = engine.state.get_duration_ms() as u64;
    if position_ms > duration {
        return Err(AppError::SeekOutOfRange(position_ms));
    }
    engine.seek(position_ms)
}

#[tauri::command]
pub async fn step_forward(state: State<'_, AppState>, step_ms: u64) -> Result<()> {
    let engine = state.engine.lock();
    let engine = engine.as_ref().ok_or(AppError::NoFileLoaded)?;
    let current = engine.state.get_position_ms() as u64;
    let duration = engine.state.get_duration_ms() as u64;
    let target = (current + step_ms).min(duration);
    engine.seek(target)
}

#[tauri::command]
pub async fn step_backward(state: State<'_, AppState>, step_ms: u64) -> Result<()> {
    let engine = state.engine.lock();
    let engine = engine.as_ref().ok_or(AppError::NoFileLoaded)?;
    let current = engine.state.get_position_ms() as u64;
    let target = current.saturating_sub(step_ms);
    engine.seek(target)
}

#[tauri::command]
pub async fn set_speed(state: State<'_, AppState>, speed: f64) -> Result<()> {
    state
        .engine
        .lock()
        .as_ref()
        .ok_or(AppError::NoFileLoaded)?
        .set_speed(speed)
}

#[tauri::command]
pub async fn set_loop(state: State<'_, AppState>, enabled: bool) -> Result<()> {
    state
        .engine
        .lock()
        .as_ref()
        .ok_or(AppError::NoFileLoaded)?
        .set_loop(enabled)
}

// ---------------------------------------------------------------------------
// Position polling
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_playback_position(state: State<'_, AppState>) -> Result<PlaybackPosition> {
    let engine = state.engine.lock();
    let engine = engine.as_ref().ok_or(AppError::NoFileLoaded)?;
    Ok(PlaybackPosition {
        position_ms: engine.state.get_position_ms(),
        is_playing: engine.state.get_is_playing(),
        duration_ms: engine.state.get_duration_ms(),
    })
}

// ---------------------------------------------------------------------------
// Marker operations
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn add_marker(
    state: State<'_, AppState>,
    position_ms: u64,
    kind: MarkerKind,
) -> Result<Marker> {
    Ok(state.markers.lock().add(position_ms, kind))
}

#[tauri::command]
pub async fn delete_marker(state: State<'_, AppState>, id: String) -> Result<()> {
    let uuid = parse_uuid(&id)?;
    state.markers.lock().remove(uuid)
}

#[tauri::command]
pub async fn move_marker(
    state: State<'_, AppState>,
    id: String,
    new_position_ms: u64,
) -> Result<()> {
    let uuid = parse_uuid(&id)?;
    state.markers.lock().move_marker(uuid, new_position_ms)
}

#[tauri::command]
pub async fn rename_segment(
    state: State<'_, AppState>,
    anchor_id: String,
    title: String,
) -> Result<()> {
    let uuid = parse_uuid(&anchor_id)?;
    state.markers.lock().rename_segment(uuid, title)
}

#[tauri::command]
pub async fn list_markers(state: State<'_, AppState>) -> Result<Vec<Marker>> {
    Ok(state.markers.lock().list().to_vec())
}

#[tauri::command]
pub async fn validate_markers(state: State<'_, AppState>) -> Result<Vec<Segment>> {
    state.markers.lock().to_segments()
}

// ---------------------------------------------------------------------------
// Audio segment export
// ---------------------------------------------------------------------------

/// Validate the current markers into segments, open a folder-picker dialog, then
/// extract each segment from the loaded audio file using the bundled ffmpeg sidecar.
/// Returns the number of segment files written.
#[tauri::command]
pub async fn export_audio_segments(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<u32> {
    use tauri_plugin_dialog::DialogExt;

    let segments = state.markers.lock().to_segments()?;
    if segments.is_empty() {
        return Err(AppError::ValidationError("No segments to export".into()));
    }

    let source_path = {
        let engine = state.engine.lock();
        engine.as_ref().ok_or(AppError::NoFileLoaded)?.metadata.file_path.clone()
    };

    let output_dir = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .ok_or(AppError::DialogCancelled)?;

    let output_path = output_dir
        .as_path()
        .ok_or_else(|| AppError::ValidationError("Invalid output directory path".into()))?;

    export_segments(&app, &source_path, &segments, output_path).await
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_uuid(s: &str) -> Result<Uuid> {
    Uuid::parse_str(s).map_err(|_| {
        AppError::ValidationError(format!("Invalid UUID: {s}"))
    })
}
