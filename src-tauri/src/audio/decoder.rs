use std::sync::{mpsc::Receiver, Arc};

use rtrb::Producer;
use symphonia::core::{
    audio::SampleBuffer,
    codecs::{DecoderOptions, CODEC_TYPE_NULL},
    errors::Error as SymphoniaError,
    formats::{FormatOptions, SeekMode, SeekTo},
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
    units::Time,
};
use symphonia::default::get_probe;

use super::control::{ControlMsg, PlaybackState};
use super::resampler::SpeedResampler;

/// Information extracted from the file before decoding begins.
pub struct DecoderInit {
    pub sample_rate: u32,
    pub channels: u16,
    pub duration_ms: u64,
}

/// Open a media file at `path` and return decoder init info without starting
/// full playback. Used by `AudioEngine::open` to extract metadata quickly.
pub fn probe_file(path: &str) -> Result<DecoderInit, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| e.to_string())?;

    let track = probed
        .format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "No supported audio track found".to_string())?;

    let params = &track.codec_params;
    let sample_rate = params.sample_rate.unwrap_or(44100);
    let channels = params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(2);
    let duration_ms = params
        .n_frames
        .map(|n| n * 1000 / sample_rate as u64)
        .unwrap_or(0);

    Ok(DecoderInit { sample_rate, channels, duration_ms })
}

/// Entry point for the decoder thread.
///
/// Decodes `path`, writes interleaved `f32` samples to `producer`, and
/// handles `ControlMsg` events (seek, pause, speed change, stop).
pub fn run_decoder(
    path: String,
    mut producer: Producer<f32>,
    control_rx: Receiver<ControlMsg>,
    state: Arc<PlaybackState>,
    initial_speed: f64,
) {
    if let Err(e) = decode_loop(&path, &mut producer, &control_rx, &state, initial_speed) {
        eprintln!("[decoder] Fatal error: {e}");
    }
    state.set_is_playing(false);
}

fn decode_loop(
    path: &str,
    producer: &mut Producer<f32>,
    control_rx: &Receiver<ControlMsg>,
    state: &Arc<PlaybackState>,
    initial_speed: f64,
) -> Result<(), String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let mut probed = get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| e.to_string())?;

    let track = probed
        .format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "No supported audio track".to_string())?
        .clone();

    let track_id = track.id;
    let params = &track.codec_params;
    let sample_rate = params.sample_rate.unwrap_or(44100);
    let channels = params.channels.map(|c| c.count()).unwrap_or(2);
    let n_frames = params.n_frames;

    if let Some(n) = n_frames {
        state.set_duration_ms(n as f64 * 1000.0 / sample_rate as f64);
    }

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;

    let mut speed = initial_speed;
    let mut looping = false;
    // Start paused — the engine's initial state is is_playing=false.
    // The decoder blocks here until the frontend calls play().
    let mut paused = true;
    let mut resampler: Option<SpeedResampler> = if (speed - 1.0).abs() > 1e-6 {
        Some(SpeedResampler::new(channels, speed))
    } else {
        None
    };

    let mut sample_buf: Option<SampleBuffer<f32>> = None;

    loop {
        // --- Handle control messages (non-blocking) ---
        loop {
            match control_rx.try_recv() {
                Ok(ControlMsg::Play) => {
                    paused = false;
                    state.set_is_playing(true);
                }
                Ok(ControlMsg::Pause) => {
                    paused = true;
                    state.set_is_playing(false);
                }
                Ok(ControlMsg::Seek(ms)) => {
                    let time = Time::from(ms as f64 / 1000.0);
                    let _ = probed.format.seek(SeekMode::Accurate, SeekTo::Time { time, track_id: Some(track_id) });
                    decoder.reset();
                    if let Some(r) = &mut resampler {
                        r.flush();
                    }
                    state.set_position_ms(ms as f64);
                }
                Ok(ControlMsg::SetSpeed(new_speed)) => {
                    speed = new_speed;
                    if (speed - 1.0).abs() < 1e-6 {
                        resampler = None;
                    } else {
                        let r = SpeedResampler::new(channels, speed);
                        if let Some(old) = &mut resampler {
                            old.flush();
                        }
                        resampler = Some(r);
                    }
                }
                Ok(ControlMsg::SetLoop(enabled)) => {
                    looping = enabled;
                }
                Ok(ControlMsg::Stop) => return Ok(()),
                Err(_) => break, // no more messages
            }
        }

        // --- If paused, wait for a control message (blocking) ---
        if paused {
            match control_rx.recv() {
                Ok(ControlMsg::Play) => {
                    paused = false;
                    state.set_is_playing(true);
                }
                Ok(ControlMsg::Stop) => return Ok(()),
                Ok(msg) => {
                    // Re-handle other messages by re-queueing via a local vec would
                    // require mpsc trickery; instead handle them here directly.
                    match msg {
                        ControlMsg::Seek(ms) => {
                            let time = Time::from(ms as f64 / 1000.0);
                            let _ = probed.format.seek(SeekMode::Accurate, SeekTo::Time { time, track_id: Some(track_id) });
                            decoder.reset();
                            if let Some(r) = &mut resampler { r.flush(); }
                            state.set_position_ms(ms as f64);
                        }
                        ControlMsg::SetSpeed(s) => {
                            speed = s;
                            resampler = if (speed - 1.0).abs() < 1e-6 { None }
                            else { Some(SpeedResampler::new(channels, speed)) };
                        }
                        ControlMsg::SetLoop(e) => looping = e,
                        _ => {}
                    }
                }
                Err(_) => return Ok(()), // channel closed
            }
            continue;
        }

        // --- Decode the next packet ---
        let packet = match probed.format.next_packet() {
            Ok(p) => p,
            Err(SymphoniaError::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                // End of stream.
                if looping {
                    let time = Time::from(0.0f64);
                    let _ = probed.format.seek(SeekMode::Accurate, SeekTo::Time { time, track_id: Some(track_id) });
                    decoder.reset();
                    if let Some(r) = &mut resampler { r.flush(); }
                    state.set_position_ms(0.0);
                    continue;
                } else {
                    state.set_is_playing(false);
                    // Wait for a Play/Stop/Seek rather than spinning.
                    match control_rx.recv() {
                        Ok(ControlMsg::Stop) | Err(_) => return Ok(()),
                        Ok(ControlMsg::Play) => {
                            // Replay from beginning.
                            let time = Time::from(0.0f64);
                            let _ = probed.format.seek(SeekMode::Accurate, SeekTo::Time { time, track_id: Some(track_id) });
                            decoder.reset();
                            state.set_position_ms(0.0);
                            state.set_is_playing(true);
                            paused = false;
                        }
                        Ok(ControlMsg::Seek(ms)) => {
                            let time = Time::from(ms as f64 / 1000.0);
                            let _ = probed.format.seek(SeekMode::Accurate, SeekTo::Time { time, track_id: Some(track_id) });
                            decoder.reset();
                            state.set_position_ms(ms as f64);
                        }
                        Ok(_) => {}
                    }
                    continue;
                }
            }
            Err(e) => {
                eprintln!("[decoder] Packet error: {e}");
                continue;
            }
        };

        // Skip packets from other tracks.
        if packet.track_id() != track_id {
            continue;
        }

        // Decode the packet to raw samples.
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(SymphoniaError::DecodeError(e)) => {
                eprintln!("[decoder] Decode error (skipping): {e}");
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };

        // Convert to interleaved f32.
        let spec = *decoded.spec();
        let duration = decoded.capacity() as u64;
        if sample_buf.is_none() {
            sample_buf = Some(SampleBuffer::<f32>::new(duration, spec));
        }
        let sb = sample_buf.as_mut().unwrap();
        sb.copy_interleaved_ref(decoded);
        let raw: &[f32] = sb.samples();

        // Update playback position.
        let pts_ms = packet.ts() as f64 * 1000.0 / sample_rate as f64;
        state.set_position_ms(pts_ms);

        // Optionally time-stretch to preserve pitch when speed != 1x.
        let samples_to_write: &[f32];
        let resampled: Vec<f32>;
        if let Some(r) = &mut resampler {
            resampled = r.process_interleaved(raw);
            samples_to_write = &resampled;
        } else {
            samples_to_write = raw;
        }

        // Write to the ring buffer, back-pressuring if full.
        // Check for control messages while waiting so Pause/Seek/Stop are
        // never blocked by a full buffer.
        let mut offset = 0;
        while offset < samples_to_write.len() {
            // Drain any pending control messages before sleeping.
            loop {
                match control_rx.try_recv() {
                    Ok(ControlMsg::Pause) => {
                        paused = true;
                        state.set_is_playing(false);
                    }
                    Ok(ControlMsg::Stop) => return Ok(()),
                    Ok(ControlMsg::Seek(ms)) => {
                        let time = Time::from(ms as f64 / 1000.0);
                        let _ = probed.format.seek(
                            SeekMode::Accurate,
                            SeekTo::Time { time, track_id: Some(track_id) },
                        );
                        decoder.reset();
                        if let Some(r) = &mut resampler { r.flush(); }
                        state.set_position_ms(ms as f64);
                        // Discard the current decoded chunk and re-enter the outer loop.
                        offset = samples_to_write.len();
                    }
                    Ok(ControlMsg::SetSpeed(new_speed)) => {
                        speed = new_speed;
                        resampler = if (speed - 1.0).abs() < 1e-6 {
                            None
                        } else {
                            Some(SpeedResampler::new(channels, speed))
                        };
                    }
                    Ok(ControlMsg::SetLoop(e)) => looping = e,
                    Ok(ControlMsg::Play) => {} // already playing
                    Err(_) => break,
                }
            }
            if paused || offset >= samples_to_write.len() {
                break;
            }
            let free = producer.slots();
            if free == 0 {
                std::thread::sleep(std::time::Duration::from_millis(1));
                continue;
            }
            let to_write = (samples_to_write.len() - offset).min(free);
            let chunk = &samples_to_write[offset..offset + to_write];
            for &s in chunk {
                let _ = producer.push(s);
            }
            offset += to_write;
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    use std::time::Duration;

    // -----------------------------------------------------------------------
    // WAV fixture helper — generates a minimal valid RIFF/PCM WAV file
    // -----------------------------------------------------------------------

    /// Write a 16-bit PCM WAV file to `path`.
    /// `num_frames` frames × `channels` channels, at `sample_rate` Hz.
    fn write_test_wav(
        path: &std::path::Path,
        sample_rate: u32,
        channels: u16,
        num_frames: u32,
    ) {
        use std::io::Write;
        let bits_per_sample: u16 = 16;
        let block_align = channels * bits_per_sample / 8;
        let byte_rate = sample_rate * block_align as u32;
        let data_size = num_frames * block_align as u32;
        let riff_size = 36u32 + data_size; // 4(WAVE)+8+16(fmt)+8+data

        let mut f = std::fs::File::create(path).unwrap();
        f.write_all(b"RIFF").unwrap();
        f.write_all(&riff_size.to_le_bytes()).unwrap();
        f.write_all(b"WAVE").unwrap();
        f.write_all(b"fmt ").unwrap();
        f.write_all(&16u32.to_le_bytes()).unwrap();
        f.write_all(&1u16.to_le_bytes()).unwrap(); // PCM
        f.write_all(&channels.to_le_bytes()).unwrap();
        f.write_all(&sample_rate.to_le_bytes()).unwrap();
        f.write_all(&byte_rate.to_le_bytes()).unwrap();
        f.write_all(&block_align.to_le_bytes()).unwrap();
        f.write_all(&bits_per_sample.to_le_bytes()).unwrap();
        f.write_all(b"data").unwrap();
        f.write_all(&data_size.to_le_bytes()).unwrap();
        // Sine wave samples
        let two_pi = 2.0 * std::f64::consts::PI;
        for i in 0..num_frames {
            for ch in 0..channels {
                let angle = i as f64 * two_pi / sample_rate as f64 * 440.0 * (ch as f64 + 1.0);
                let sample = (angle.sin() * i16::MAX as f64) as i16;
                f.write_all(&sample.to_le_bytes()).unwrap();
            }
        }
        f.flush().unwrap();
    }

    // -----------------------------------------------------------------------
    // Helper: spawn a decoder with a given ring buffer capacity and initial speed
    // -----------------------------------------------------------------------

    fn spawn_decoder(
        path: &str,
        ring_capacity: usize,
        initial_speed: f64,
    ) -> (
        mpsc::SyncSender<ControlMsg>,
        Arc<PlaybackState>,
        std::thread::JoinHandle<()>,
        rtrb::Consumer<f32>,
    ) {
        let (producer, consumer) = rtrb::RingBuffer::<f32>::new(ring_capacity);
        let (tx, rx) = mpsc::sync_channel::<ControlMsg>(32);
        let state = Arc::new(PlaybackState::new());
        let state_c = Arc::clone(&state);
        let path_owned = path.to_string();
        let handle = std::thread::spawn(move || {
            run_decoder(path_owned, producer, rx, state_c, initial_speed);
        });
        (tx, state, handle, consumer)
    }

    /// Poll `predicate` up to `timeout` sleeping 5ms between checks.
    fn wait_until(predicate: impl Fn() -> bool, timeout: Duration) -> bool {
        let deadline = std::time::Instant::now() + timeout;
        while std::time::Instant::now() < deadline {
            if predicate() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        false
    }

    // -----------------------------------------------------------------------
    // probe_file tests
    // -----------------------------------------------------------------------

    #[test]
    fn probe_file_valid_wav_returns_metadata() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("test.wav");
        write_test_wav(&path, 44100, 1, 4410); // 100 ms mono
        let init = probe_file(path.to_str().unwrap()).unwrap();
        assert_eq!(init.sample_rate, 44100);
        assert_eq!(init.channels, 1);
        assert!(init.duration_ms > 0);
    }

    #[test]
    fn probe_file_stereo_wav() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("stereo.wav");
        write_test_wav(&path, 48000, 2, 9600); // 200 ms stereo
        let init = probe_file(path.to_str().unwrap()).unwrap();
        assert_eq!(init.sample_rate, 48000);
        assert_eq!(init.channels, 2);
    }

    #[test]
    fn probe_file_missing_file_returns_error() {
        let result = probe_file("/nonexistent/path/audio.wav");
        assert!(result.is_err());
    }

    #[test]
    fn probe_file_empty_file_returns_error() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("empty.wav");
        std::fs::File::create(&path).unwrap(); // 0-byte file
        let result = probe_file(path.to_str().unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn probe_file_no_extension_hint() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("noext"); // no .wav extension
        write_test_wav(&path, 44100, 1, 4410);
        // Symphonia may still probe successfully via content detection.
        // Either Ok or Err is acceptable; we just verify it doesn't panic.
        let _ = probe_file(path.to_str().unwrap());
    }

    // -----------------------------------------------------------------------
    // run_decoder tests
    // -----------------------------------------------------------------------

    #[test]
    fn decoder_stop_immediately() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_play_then_stop() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        // Small ring buffer (256 < 4410) creates back-pressure so the decoder
        // stays in the write loop with is_playing=true until we send Stop.
        let (tx, state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 256, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        assert!(wait_until(|| state.get_is_playing(), Duration::from_secs(2)));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_pause_then_play_then_stop() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 256, 1.0);
        // Starts paused; send Pause (exercises the no-op _ arm while paused).
        tx.send(ControlMsg::Pause).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        // Now send Play to start playback.
        tx.send(ControlMsg::Play).unwrap();
        assert!(wait_until(|| state.get_is_playing(), Duration::from_secs(2)));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_seek_while_paused() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        // Decoder starts paused; send Seek while paused.
        tx.send(ControlMsg::Seek(50)).unwrap();
        std::thread::sleep(Duration::from_millis(50));
        assert_eq!(state.get_position_ms(), 50.0);
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_set_speed_while_paused() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::SetSpeed(2.0)).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_set_loop_while_paused() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::SetLoop(true)).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_channel_closed_while_paused_exits() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        drop(tx); // closing the channel while paused triggers Err(_) => Ok(())
        handle.join().unwrap();
    }

    #[test]
    fn decoder_set_speed_at_1x_disables_resampler() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        // Start with non-1x speed so resampler is created, then switch back.
        let (tx, _state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 2.0);
        tx.send(ControlMsg::SetSpeed(1.0)).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_loop_mode_restarts_at_eof() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("short.wav");
        // Very short: 10 ms at 44100 Hz = 441 frames
        write_test_wav(&path, 44100, 1, 441);
        let (tx, state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::SetLoop(true)).unwrap();
        tx.send(ControlMsg::Play).unwrap();
        // Let it play and loop at least once; position resets to near 0 on loop.
        assert!(wait_until(|| state.get_is_playing(), Duration::from_secs(2)));
        std::thread::sleep(Duration::from_millis(100));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_eof_no_loop_stop_after_eof() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("short.wav");
        write_test_wav(&path, 44100, 1, 441); // 10 ms
        let (tx, state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        // Wait until EOF (decoder sets is_playing=false after EOF without loop).
        assert!(wait_until(|| !state.get_is_playing(), Duration::from_secs(3)));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_eof_no_loop_seek_after_eof() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("short.wav");
        write_test_wav(&path, 44100, 1, 441);
        let (tx, state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        assert!(wait_until(|| !state.get_is_playing(), Duration::from_secs(3)));
        // Send Seek after EOF — decoder handles it in the post-EOF recv block.
        tx.send(ControlMsg::Seek(0)).unwrap();
        std::thread::sleep(Duration::from_millis(50));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_eof_no_loop_play_restarts() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("short.wav");
        write_test_wav(&path, 44100, 1, 441);
        // Large buffer so decoder reaches EOF without back-pressure.
        let (tx, state, handle, mut consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        // Drain consumer continuously so decoder can proceed to EOF.
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        assert!(wait_until(|| !state.get_is_playing(), Duration::from_secs(3)));
        // Re-send Play — decoder should seek to 0 and restart (exercises that code path).
        tx.send(ControlMsg::Play).unwrap();
        // Give the decoder a moment to process Play and re-decode, then stop.
        std::thread::sleep(Duration::from_millis(50));
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_eof_no_loop_other_msg_continues() {
        // Exercises the Ok(_) => {} catch-all in the post-EOF recv block.
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("short.wav");
        write_test_wav(&path, 44100, 1, 441);
        let (tx, state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        assert!(wait_until(|| !state.get_is_playing(), Duration::from_secs(3)));
        // Send SetLoop(false) — hits the Ok(_) catch-all at EOF, then continues loop.
        tx.send(ControlMsg::SetLoop(false)).unwrap();
        std::thread::sleep(Duration::from_millis(30));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_write_loop_pause() {
        // Small ring buffer forces back-pressure; send Pause during write loop.
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        // Tiny ring buffer (32 samples) → decoder enters write loop immediately.
        let (tx, state, handle, mut consumer) =
            spawn_decoder(path.to_str().unwrap(), 32, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        // Let the decoder start and fill the tiny buffer.
        std::thread::sleep(Duration::from_millis(10));
        tx.send(ControlMsg::Pause).unwrap();
        // Drain the ring so the decoder can unblock.
        std::thread::sleep(Duration::from_millis(5));
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        assert!(wait_until(|| !state.get_is_playing(), Duration::from_secs(2)));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_write_loop_stop() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, mut consumer) =
            spawn_decoder(path.to_str().unwrap(), 32, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        tx.send(ControlMsg::Stop).unwrap();
        // Drain so the decoder can exit the write loop.
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        handle.join().unwrap();
    }

    #[test]
    fn decoder_write_loop_seek() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, mut consumer) =
            spawn_decoder(path.to_str().unwrap(), 32, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        tx.send(ControlMsg::Seek(0)).unwrap();
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        std::thread::sleep(Duration::from_millis(20));
        tx.send(ControlMsg::Stop).unwrap();
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        handle.join().unwrap();
    }

    #[test]
    fn decoder_write_loop_set_speed() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, mut consumer) =
            spawn_decoder(path.to_str().unwrap(), 32, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        tx.send(ControlMsg::SetSpeed(1.5)).unwrap();
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        std::thread::sleep(Duration::from_millis(20));
        tx.send(ControlMsg::Stop).unwrap();
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        handle.join().unwrap();
    }

    #[test]
    fn decoder_write_loop_set_loop() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, mut consumer) =
            spawn_decoder(path.to_str().unwrap(), 32, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        tx.send(ControlMsg::SetLoop(true)).unwrap();
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        std::thread::sleep(Duration::from_millis(20));
        tx.send(ControlMsg::Stop).unwrap();
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        handle.join().unwrap();
    }

    #[test]
    fn decoder_write_loop_play_noop() {
        // Exercises the `Ok(ControlMsg::Play) => {}` arm (already playing).
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, mut consumer) =
            spawn_decoder(path.to_str().unwrap(), 32, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        // Send Play while already playing.
        tx.send(ControlMsg::Play).unwrap();
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        std::thread::sleep(Duration::from_millis(20));
        tx.send(ControlMsg::Stop).unwrap();
        let _ = consumer.read_chunk(consumer.slots()).map(|c| c.commit_all());
        handle.join().unwrap();
    }

    #[test]
    fn decoder_nonblocking_seek_while_playing() {
        // Exercises ControlMsg::Seek in the non-blocking loop (top of outer loop).
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        tx.send(ControlMsg::Seek(0)).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_nonblocking_set_speed_while_playing() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        let (tx, _state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 65536, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        tx.send(ControlMsg::SetSpeed(2.0)).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        tx.send(ControlMsg::SetSpeed(1.0)).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn decoder_nonblocking_pause_while_playing() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("t.wav");
        write_test_wav(&path, 44100, 1, 4410);
        // Small buffer keeps is_playing=true in the write loop.
        let (tx, state, handle, _consumer) =
            spawn_decoder(path.to_str().unwrap(), 256, 1.0);
        tx.send(ControlMsg::Play).unwrap();
        assert!(wait_until(|| state.get_is_playing(), Duration::from_secs(2)));
        tx.send(ControlMsg::Pause).unwrap();
        assert!(wait_until(|| !state.get_is_playing(), Duration::from_secs(2)));
        tx.send(ControlMsg::Stop).unwrap();
        handle.join().unwrap();
    }

    #[test]
    fn run_decoder_bad_path_sets_not_playing() {
        let (producer, _consumer) = rtrb::RingBuffer::<f32>::new(1024);
        let (tx, rx) = mpsc::sync_channel::<ControlMsg>(4);
        let state = Arc::new(PlaybackState::new());
        let state_c = Arc::clone(&state);
        let handle = std::thread::spawn(move || {
            run_decoder("/nonexistent/audio.wav".to_string(), producer, rx, state_c, 1.0);
        });
        drop(tx);
        handle.join().unwrap();
        assert!(!state.get_is_playing());
    }
}
