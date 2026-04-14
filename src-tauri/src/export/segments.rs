use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::ShellExt;

use crate::error::{AppError, Result};
use crate::markers::Segment;
use super::csv::{ms_to_timestamp, write_csv};

/// Strip characters that are invalid in file names on Windows, macOS, or Linux.
fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let trimmed = cleaned.trim().to_string();
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed
    }
}

/// Core export logic: iterates `segments`, calls `run_ffmpeg` for each one,
/// then writes the CSV index. Testable without an `AppHandle`.
///
/// `run_ffmpeg` receives the CLI args and returns `(success, stderr_bytes)`.
async fn export_segments_inner<F, Fut>(
    source_file: &str,
    segments: &[Segment],
    output_dir: &Path,
    export_csv: bool, 
    export_audio: bool,
    mut run_ffmpeg: F,
) -> Result<u32>
where
    F: FnMut(Vec<String>) -> Fut,
    Fut: std::future::Future<Output = Result<(bool, Vec<u8>)>>,
{
    std::fs::create_dir_all(output_dir)?;

    let source_path = Path::new(source_file);
    let ext = source_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp3");
    let stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");

    for seg in segments.iter() {
        let title = sanitize_filename(&seg.title);
        let filename = format!("{}.{}", title, ext);
        let output_path: PathBuf = output_dir.join(&filename);

        let start = ms_to_timestamp(seg.start_ms);
        let end = ms_to_timestamp(seg.end_ms);

        let args = vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(), "error".to_string(),
            "-y".to_string(),
            "-ss".to_string(), start,
            "-to".to_string(), end,
            "-i".to_string(), source_file.to_string(),
            output_path.to_str().unwrap_or_default().to_string(),
        ];

        if export_audio {
            let (success, stderr) = run_ffmpeg(args).await?;
            if !success {
                let stderr_str = String::from_utf8_lossy(&stderr).into_owned();
                return Err(AppError::FfmpegFailed(filename, stderr_str));
            }
        }
    }

    // Write the CSV index file.
    if export_csv {
        let csv_path = output_dir.join(format!("{}.csv", stem));
        let csv_file = std::fs::File::create(csv_path)?;
        write_csv(csv_file, segments)?;
    }

    Ok(segments.len() as u32)
}

/// Extract `segments` from `source_file` into individual files under `output_dir`.
///
/// Invokes the bundled ffmpeg sidecar once per segment. Also writes a CSV index
/// file (`{stem}.csv`) in the output directory.
///
/// Returns the number of segments written.
pub async fn export_segments<R: Runtime>(
    app: &AppHandle<R>,
    source_file: &str,
    segments: &[Segment],
    output_dir: &Path,
    export_csv: bool,
    export_audio: bool,
) -> Result<u32> {
    let app = app.clone();
    let source_file = source_file.to_string();
    export_segments_inner(
        &source_file,
        segments,
        output_dir,
        export_csv, 
        export_audio,
        move |args| {
            let app = app.clone();
            async move {
                let output = app
                    .shell()
                    .sidecar("ffmpeg")
                    .map_err(|e| AppError::FfmpegNotFound(e.to_string()))?
                    .args(args.iter().map(|s| s.as_str()).collect::<Vec<_>>())
                    .output()
                    .await
                    .map_err(|e| AppError::FfmpegNotFound(e.to_string()))?;
                Ok((output.status.success(), output.stderr))
            }
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markers::Segment;

    fn seg(start_ms: u64, end_ms: u64, title: &str) -> Segment {
        Segment { start_ms, end_ms, title: title.to_string() }
    }

    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Runtime::new().unwrap().block_on(f)
    }

    // -----------------------------------------------------------------------
    // sanitize_filename tests
    // -----------------------------------------------------------------------

    #[test]
    fn strips_invalid_chars() {
        assert_eq!(sanitize_filename("hello/world"), "helloworld");
        assert_eq!(sanitize_filename("foo:bar"), "foobar");
        assert_eq!(sanitize_filename(r#"a\b*c?d"e<f>g|h"#), "abcdefgh");
    }

    #[test]
    fn trims_whitespace() {
        assert_eq!(sanitize_filename("  hello  "), "hello");
    }

    #[test]
    fn empty_becomes_untitled() {
        assert_eq!(sanitize_filename(""), "untitled");
        assert_eq!(sanitize_filename("   "), "untitled");
        assert_eq!(sanitize_filename("///"), "untitled");
    }

    #[test]
    fn normal_title_unchanged() {
        assert_eq!(sanitize_filename("01 Opening Theme"), "01 Opening Theme");
    }

    // -----------------------------------------------------------------------
    // export_segments_inner tests (no AppHandle needed)
    // -----------------------------------------------------------------------

    #[test]
    fn export_empty_segments_writes_csv_and_returns_zero() {
        let dir = tempfile::TempDir::new().unwrap();
        let result = block_on(export_segments_inner(
            "test.wav",
            &[],
            dir.path(),
            true, 
            true, 
            |_args| async { Ok((true, Vec::new())) },
        ));
        assert_eq!(result.unwrap(), 0);
        assert!(dir.path().join("test.csv").exists());
    }

    #[test]
    fn export_two_segments_returns_count_2() {
        let dir = tempfile::TempDir::new().unwrap();
        let segments = vec![seg(0, 5000, "Intro"), seg(5000, 10000, "Main")];
        let result = block_on(export_segments_inner(
            "track.mp3",
            &segments,
            dir.path(),
            true, 
            true, 
            |_args| async { Ok((true, Vec::new())) },
        ));
        assert_eq!(result.unwrap(), 2);
    }

    #[test]
    fn export_csv_uses_source_stem() {
        let dir = tempfile::TempDir::new().unwrap();
        let segments = vec![seg(0, 1000, "A")];
        block_on(export_segments_inner(
            "/path/to/my_track.wav",
            &segments,
            dir.path(),
            true, 
            true,
            |_args| async { Ok((true, Vec::new())) },
        ))
        .unwrap();
        assert!(dir.path().join("my_track.csv").exists());
    }

    #[test]
    fn export_source_no_extension_defaults_to_mp3() {
        let dir = tempfile::TempDir::new().unwrap();
        let segments = vec![seg(0, 1000, "Track")];
        block_on(export_segments_inner(
            "noext",
            &segments,
            dir.path(),
            true, 
            true,
            |args| {
                // Verify the output filename ends with .mp3
                let out_arg = args.last().unwrap().clone();
                async move {
                    assert!(out_arg.ends_with(".mp3"), "Expected .mp3 extension, got: {}", out_arg);
                    Ok((true, Vec::new()))
                }
            },
        ))
        .unwrap();
    }

    #[test]
    fn export_ffmpeg_failure_returns_error() {
        let dir = tempfile::TempDir::new().unwrap();
        let segments = vec![seg(0, 1000, "Fail")];
        let result = block_on(export_segments_inner(
            "test.wav",
            &segments,
            dir.path(),
            true, 
            true, 
            |_args| async { Ok((false, b"codec error".to_vec())) },
        ));
        match result {
            Err(AppError::FfmpegFailed(filename, stderr)) => {
                assert!(filename.contains("Fail"));
                assert_eq!(stderr, "codec error");
            }
            other => panic!("Expected FfmpegFailed, got {:?}", other),
        }
    }

    #[test]
    fn export_ffmpeg_not_found_propagates() {
        let dir = tempfile::TempDir::new().unwrap();
        let segments = vec![seg(0, 1000, "X")];
        let result = block_on(export_segments_inner(
            "test.wav",
            &segments,
            dir.path(),
            true, 
            true,
            |_args| async {
                Err(AppError::FfmpegNotFound("sidecar unavailable".into()))
            },
        ));
        assert!(matches!(result, Err(AppError::FfmpegNotFound(_))));
    }

    #[test]
    fn export_output_dir_is_created() {
        let dir = tempfile::TempDir::new().unwrap();
        let nested = dir.path().join("a").join("b").join("c");
        assert!(!nested.exists());
        block_on(export_segments_inner(
            "test.wav",
            &[],
            &nested,
            true, 
            true, 
            |_args| async { Ok((true, Vec::new())) },
        ))
        .unwrap();
        assert!(nested.exists());
    }
}
