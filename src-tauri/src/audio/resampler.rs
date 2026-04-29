/// Streaming tempo shifter using overlap-add (OLA).
///
/// This changes playback speed without explicit sample-rate conversion, which
/// preserves perceived pitch substantially better than varispeed resampling.
pub struct SpeedResampler {
    channels: usize,
    speed: f64,
    window_size: usize,
    overlap: usize,
    synthesis_hop: usize,
    analysis_pos: f64,
    partial: Vec<Vec<f32>>,
    prev_frame: Option<Vec<Vec<f32>>>,
}

impl SpeedResampler {
    pub fn new(channels: usize, speed: f64) -> Self {
        let speed = speed.clamp(0.1, 4.0);
        let window_size = 1024usize;
        let overlap = 256usize;
        let synthesis_hop = window_size - overlap;
        Self {
            channels,
            speed,
            window_size,
            overlap,
            synthesis_hop,
            analysis_pos: 0.0,
            partial: vec![Vec::new(); channels],
            prev_frame: None,
        }
    }

    /// Feed interleaved samples and return time-stretched interleaved output.
    pub fn process_interleaved(&mut self, input: &[f32]) -> Vec<f32> {
        if self.channels == 0 || input.is_empty() {
            return Vec::new();
        }

        for (i, &sample) in input.iter().enumerate() {
            self.partial[i % self.channels].push(sample);
        }

        let analysis_hop = (self.synthesis_hop as f64 * self.speed).max(1.0);
        let mut out_channels = vec![Vec::new(); self.channels];

        loop {
            let frame_start = self.analysis_pos.floor() as usize;
            let available = self.partial[0].len();
            if frame_start + self.window_size > available {
                break;
            }

            let current_frame: Vec<Vec<f32>> = self
                .partial
                .iter()
                .map(|ch_buf| ch_buf[frame_start..frame_start + self.window_size].to_vec())
                .collect();

            if let Some(prev) = &self.prev_frame {
                for ch in 0..self.channels {
                    for i in 0..self.overlap {
                        let t = i as f32 / self.overlap as f32;
                        let a = prev[ch][self.synthesis_hop + i];
                        let b = current_frame[ch][i];
                        out_channels[ch].push(a * (1.0 - t) + b * t);
                    }
                    for i in self.overlap..self.synthesis_hop {
                        out_channels[ch].push(current_frame[ch][i]);
                    }
                }
            } else {
                for ch in 0..self.channels {
                    out_channels[ch].extend_from_slice(&current_frame[ch][..self.synthesis_hop]);
                }
            }

            self.prev_frame = Some(current_frame);
            self.analysis_pos += analysis_hop;
        }

        // Keep enough lookback for the next frame start.
        let drain_to = (self.analysis_pos.floor() as usize).saturating_sub(self.window_size);
        if drain_to > 0 {
            for ch in &mut self.partial {
                ch.drain(..drain_to);
            }
            self.analysis_pos -= drain_to as f64;
        }

        interleave(&out_channels)
    }

    pub fn flush(&mut self) {
        for ch in &mut self.partial {
            ch.clear();
        }
        self.prev_frame = None;
        self.analysis_pos = 0.0;
    }
}

fn interleave(channels: &[Vec<f32>]) -> Vec<f32> {
    if channels.is_empty() {
        return Vec::new();
    }
    let frames = channels[0].len();
    let mut out = Vec::with_capacity(frames * channels.len());
    for f in 0..frames {
        for ch in channels {
            if f < ch.len() {
                out.push(ch[f]);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn double_speed_output_is_approximately_half_input_length() {
        // 2.0x speed should emit fewer output samples than input.
        let mut r = SpeedResampler::new(1, 2.0);
        let input: Vec<f32> = (0..8192).map(|i| (i as f32).sin()).collect();
        let output = r.process_interleaved(&input);
        assert!(!output.is_empty(), "Expected non-empty output");
        assert!(
            output.len() < input.len(),
            "Expected output shorter than input at 2x speed, got {} vs {}",
            output.len(),
            input.len()
        );
    }

    #[test]
    fn half_speed_produces_more_output_than_input_after_warmup() {
        let mut r = SpeedResampler::new(1, 0.5);
        let chunk = vec![0.0f32; 2048];
        let mut total_output = 0usize;
        let iterations = 10;
        for _ in 0..iterations {
            total_output += r.process_interleaved(&chunk).len();
        }
        let total_input = chunk.len() * iterations;
        assert!(
            total_output > total_input,
            "After warmup, output ({total_output}) should exceed input ({total_input}) at 0.5x speed"
        );
    }

    #[test]
    fn flush_clears_partial_buffer() {
        let mut r = SpeedResampler::new(1, 2.0);
        // Feed a small amount (not a full chunk).
        let partial_input: Vec<f32> = vec![0.0f32; 100];
        r.process_interleaved(&partial_input);
        assert_eq!(r.partial[0].len(), 100);
        assert!(r.prev_frame.is_none());
        r.flush();
        assert_eq!(r.partial[0].len(), 0);
        assert!(r.prev_frame.is_none());
        assert_eq!(r.analysis_pos, 0.0);
    }

    #[test]
    fn interleave_two_channels() {
        let ch0 = vec![1.0f32, 2.0, 3.0];
        let ch1 = vec![4.0f32, 5.0, 6.0];
        let result = interleave(&[ch0, ch1]);
        assert_eq!(result, vec![1.0, 4.0, 2.0, 5.0, 3.0, 6.0]);
    }

    #[test]
    fn interleave_empty_channels_returns_empty() {
        let result = interleave(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn interleave_mismatched_channel_lengths() {
        // ch0 has 3 frames, ch1 has only 1 — exercises the `if f < ch.len()` guard
        let ch0 = vec![1.0f32, 2.0, 3.0];
        let ch1 = vec![4.0f32];
        let result = interleave(&[ch0, ch1]);
        // frame 0: ch0[0]=1.0, ch1[0]=4.0
        // frame 1: ch0[1]=2.0, ch1 skipped (f=1 >= ch1.len()=1)
        // frame 2: ch0[2]=3.0, ch1 skipped
        assert_eq!(result, vec![1.0, 4.0, 2.0, 3.0]);
    }
}
