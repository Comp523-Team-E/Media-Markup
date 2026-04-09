use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("No file loaded")]
    NoFileLoaded,
    #[error("Seek out of range: {0} ms")]
    SeekOutOfRange(u64),
    #[error("Marker not found: {0}")]
    MarkerNotFound(Uuid),
    #[error("Validation failed: {0}")]
    ValidationError(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Decode error: {0}")]
    Decode(String),
    #[error("Audio output error: {0}")]
    AudioOutput(String),
    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),
    #[error("Dialog cancelled")]
    DialogCancelled,
    #[error("ffmpeg sidecar not available: {0}")]
    FfmpegNotFound(String),
    #[error("ffmpeg failed on segment '{0}': {1}")]
    FfmpegFailed(String, String),
}

// Tauri requires command errors to be serializable so they can be sent over IPC.
impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(
        &self,
        s: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
