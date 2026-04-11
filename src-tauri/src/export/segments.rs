use std::path::{Path, PathBuf};

use tauri::AppHandle;
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

/// Extract `segments` from `source_file` into individual files under `output_dir`.
///
/// Invokes the bundled ffmpeg sidecar once per segment. Also writes a TOC text
/// file (`{stem}.txt`) in the output directory listing each segment's duration.
///
/// Returns the number of segments written.
pub async fn export_segments(
    app: &AppHandle,
    source_file: &str,
    segments: &[Segment],
    output_dir: &Path,
) -> Result<u32> {
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

    let mut toc_lines: Vec<String> = Vec::new();

    for (i, seg) in segments.iter().enumerate() {
        let index = i + 1;
        let title = sanitize_filename(&seg.title);
        let filename = format!("{:02} {}.{}", index, title, ext);
        let output_path: PathBuf = output_dir.join(&filename);

        let start = ms_to_timestamp(seg.start_ms);
        let end = ms_to_timestamp(seg.end_ms);

        let output = app
            .shell()
            .sidecar("ffmpeg")
            .map_err(|e| AppError::FfmpegNotFound(e.to_string()))?
            .args([
                "-hide_banner",
                "-loglevel", "error",
                "-y",
                "-ss", &start,
                "-to", &end,
                "-i", source_file,
                output_path.to_str().unwrap_or_default(),
            ])
            .output()
            .await
            .map_err(|e| AppError::FfmpegNotFound(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
            return Err(AppError::FfmpegFailed(filename, stderr));
        }

        let duration = ms_to_timestamp(seg.end_ms.saturating_sub(seg.start_ms));
        toc_lines.push(format!("[{}] {}", duration, filename));
    }

    // Write the CSV index file.
    let csv_path = output_dir.join(format!("{}.csv", stem));
    let csv_file = std::fs::File::create(csv_path)?;
    write_csv(csv_file, segments)?;

    Ok(segments.len() as u32)
}

#[cfg(test)]
mod tests {
    use super::sanitize_filename;

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
}
