use std::sync::{
    mpsc::{self, SyncSender},
    Arc,
};
use rtrb::RingBuffer;

use crate::error::{AppError, Result};
use super::control::{ControlMsg, PlaybackState};
use super::decoder::{probe_file, run_decoder};
use super::output::{open_cpal_sink, CpalSink};

/// Ring buffer capacity in samples.
/// At 44100 Hz stereo this is ~0.37 seconds of buffered audio.
const RING_BUFFER_CAPACITY: usize = 32_768;

/// Metadata extracted from a media file on open.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub file_name: String,
    pub file_path: String,
    pub duration_ms: u64,
    pub sample_rate: u32,
    pub channels: u16,
}

/// The live audio engine for a single loaded file.
///
/// Owns the decoder thread and the cpal output stream for the lifetime of the
/// loaded file. Dropping it sends a `Stop` message and joins the decoder thread.
pub struct AudioEngine {
    control_tx: SyncSender<ControlMsg>,
    pub state: Arc<PlaybackState>,
    pub metadata: FileMetadata,
    decoder_handle: Option<std::thread::JoinHandle<()>>,
    /// Kept alive so cpal keeps streaming; dropped when the engine is dropped.
    _sink: CpalSink,
}

impl AudioEngine {
    /// Open `path`, start the decoder thread and cpal output, return the engine.
    /// The engine starts in a paused state; call `play()` to begin playback.
    pub fn open(path: &str) -> Result<Self> {
        // Probe the file for metadata.
        let init = probe_file(path).map_err(AppError::Decode)?;

        let file_name = std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path)
            .to_string();

        let metadata = FileMetadata {
            file_name,
            file_path: path.to_string(),
            duration_ms: init.duration_ms,
            sample_rate: init.sample_rate,
            channels: init.channels,
        };

        let state = Arc::new(PlaybackState::new());
        state.set_duration_ms(init.duration_ms as f64);
        // Start paused.
        state.set_is_playing(false);

        // Build the SPSC ring buffer shared between decoder (producer) and cpal (consumer).
        let (producer, consumer) = RingBuffer::<f32>::new(RING_BUFFER_CAPACITY);

        // Control channel: bounded so the UI cannot queue unbounded messages.
        let (control_tx, control_rx) = mpsc::sync_channel::<ControlMsg>(8);

        // Start the cpal output stream.
        let sink = open_cpal_sink(
            consumer,
            init.sample_rate,
            init.channels,
            Arc::clone(&state),
        )?;

        let path_owned = path.to_string();
        let state_for_decoder = Arc::clone(&state);

        let handle = std::thread::Builder::new()
            .name("audio-decoder".to_string())
            .spawn(move || {
                run_decoder(path_owned, producer, control_rx, state_for_decoder, 1.0);
            })
            .map_err(|e| AppError::AudioOutput(e.to_string()))?;

        Ok(AudioEngine {
            control_tx,
            state,
            metadata,
            decoder_handle: Some(handle),
            _sink: sink,
        })
    }

    pub fn play(&self) -> Result<()> {
        self.send(ControlMsg::Play)
    }

    pub fn pause(&self) -> Result<()> {
        self.send(ControlMsg::Pause)
    }

    pub fn seek(&self, position_ms: u64) -> Result<()> {
        self.send(ControlMsg::Seek(position_ms))
    }

    pub fn set_speed(&self, speed: f64) -> Result<()> {
        self.send(ControlMsg::SetSpeed(speed))
    }

    pub fn set_loop(&self, enabled: bool) -> Result<()> {
        self.send(ControlMsg::SetLoop(enabled))
    }

    fn send(&self, msg: ControlMsg) -> Result<()> {
        self.control_tx
            .send(msg)
            .map_err(|_| AppError::AudioOutput("Decoder thread has exited".into()))
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        let _ = self.control_tx.send(ControlMsg::Stop);
        if let Some(handle) = self.decoder_handle.take() {
            let _ = handle.join();
        }
    }
}
