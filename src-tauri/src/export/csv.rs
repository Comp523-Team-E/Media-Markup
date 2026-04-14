use crate::error::{AppError, Result};
use crate::markers::Segment;

/// Format a millisecond timestamp as `HH:MM:SS.mmm`.
pub fn ms_to_timestamp(ms: u64) -> String {
    let total_secs = ms / 1000;
    let millis = ms % 1000;
    let secs = total_secs % 60;
    let minutes = (total_secs / 60) % 60;
    let hours = total_secs / 3600;
    format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, secs, millis)
}

/// Write `segments` to an arbitrary writer.
pub fn write_csv<W: std::io::Write>(writer: W, segments: &[Segment]) -> Result<()> {
    let mut wtr = csv::Writer::from_writer(writer);
    let mut counter = 1;

    for seg in segments {
        wtr.write_record([
            &counter.to_string(),
            &ms_to_timestamp(seg.start_ms),
            &ms_to_timestamp(seg.end_ms),
            &seg.title,
        ])?;

        counter += 1;
    }
    wtr.flush()?;
    Ok(())
}

/// Parse a timestamp string `HH:MM:SS.mmm` into milliseconds.
/// Returns `None` if the format is invalid.
pub fn parse_timestamp(s: &str) -> Option<u64> {
    let parts: Vec<&str> = s.splitn(3, ':').collect();
    if parts.len() != 3 {
        return None;
    }
    let hours: u64 = parts[0].parse().ok()?;
    let minutes: u64 = parts[1].parse().ok()?;
    let sec_parts: Vec<&str> = parts[2].splitn(2, '.').collect();
    if sec_parts.len() != 2 {
        return None;
    }
    let seconds: u64 = sec_parts[0].parse().ok()?;
    let millis: u64 = sec_parts[1].parse().ok()?;
    Some((hours * 3_600 + minutes * 60 + seconds) * 1_000 + millis)
}

/// Read CSV rows (no header) from `reader` and return a list of `Segment`s.
/// Expected columns: Index, Start Timestamp, End Timestamp, Segment Title.
pub fn import_markers_from_reader<R: std::io::Read>(reader: R) -> Result<Vec<Segment>> {
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(false)
        .from_reader(reader);

    let mut segments = Vec::new();

    for (row_idx, result) in rdr.records().enumerate() {
        let record = result?;
        if record.len() < 4 {
            return Err(AppError::ValidationError(format!(
                "Row {}: expected 4 fields, got {}",
                row_idx + 1,
                record.len()
            )));
        }
        let start_ms = parse_timestamp(record[1].trim()).ok_or_else(|| {
            AppError::ValidationError(format!(
                "Row {}: invalid start timestamp {:?}",
                row_idx + 1,
                &record[1]
            ))
        })?;
        let end_ms = parse_timestamp(record[2].trim()).ok_or_else(|| {
            AppError::ValidationError(format!(
                "Row {}: invalid end timestamp {:?}",
                row_idx + 1,
                &record[2]
            ))
        })?;
        let title = record[3].trim().to_string();
        segments.push(Segment { start_ms, end_ms, title });
    }

    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markers::Segment;

    fn seg(start_ms: u64, end_ms: u64, title: &str) -> Segment {
        Segment { start_ms, end_ms, title: title.to_string() }
    }

    // --- Timestamp tests ---

    #[test]
    fn timestamp_zero() {
        assert_eq!(ms_to_timestamp(0), "00:00:00.000");
    }

    #[test]
    fn timestamp_one_hour_one_minute_one_second_500ms() {
        assert_eq!(ms_to_timestamp(3_661_500), "01:01:01.500");
    }

    #[test]
    fn timestamp_max_under_24h() {
        assert_eq!(ms_to_timestamp(86_399_999), "23:59:59.999");
    }

    #[test]
    fn timestamp_exactly_one_second() {
        assert_eq!(ms_to_timestamp(1_000), "00:00:01.000");
    }

    #[test]
    fn timestamp_exactly_one_minute() {
        assert_eq!(ms_to_timestamp(60_000), "00:01:00.000");
    }

    // --- CSV write tests ---

    #[test]
    fn empty_segments_produces_no_output() {
        let mut buf: Vec<u8> = Vec::new();
        write_csv(&mut buf, &[]).unwrap();
        assert!(String::from_utf8(buf).unwrap().is_empty());
    }

    #[test]
    fn single_segment_produces_one_row() {
        let mut buf: Vec<u8> = Vec::new();
        write_csv(&mut buf, &[seg(0, 5000, "001 Segment")]).unwrap();
        let s = String::from_utf8(buf).unwrap();
        let lines: Vec<&str> = s.lines().collect();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0], "1,00:00:00.000,00:00:05.000,001 Segment");
    }

    #[test]
    fn multiple_segments_are_all_written() {
        let segs = vec![
            seg(0, 5000, "001 Segment"),
            seg(6000, 10000, "002 Segment"),
        ];
        let mut buf: Vec<u8> = Vec::new();
        write_csv(&mut buf, &segs).unwrap();
        let s = String::from_utf8(buf).unwrap();
        let lines: Vec<&str> = s.lines().collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[1], "2,00:00:06.000,00:00:10.000,002 Segment");
    }

    #[test]
    fn title_with_comma_is_quoted() {
        let mut buf: Vec<u8> = Vec::new();
        write_csv(&mut buf, &[seg(0, 1000, "Hello, World")]).unwrap();
        let s = String::from_utf8(buf).unwrap();
        assert!(s.contains("\"Hello, World\""));
    }

    #[test]
    fn write_csv_io_error_propagates() {
        struct FailWriter;
        impl std::io::Write for FailWriter {
            fn write(&mut self, _buf: &[u8]) -> std::io::Result<usize> {
                Err(std::io::Error::new(std::io::ErrorKind::BrokenPipe, "fail"))
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Err(std::io::Error::new(std::io::ErrorKind::BrokenPipe, "fail"))
            }
        }
        let result = write_csv(FailWriter, &[seg(0, 1000, "test")]);
        assert!(result.is_err());
    }

    // --- parse_timestamp tests ---

    #[test]
    fn parse_timestamp_zero() {
        assert_eq!(parse_timestamp("00:00:00.000"), Some(0));
    }

    #[test]
    fn parse_timestamp_one_second() {
        assert_eq!(parse_timestamp("00:00:01.000"), Some(1_000));
    }

    #[test]
    fn parse_timestamp_one_minute() {
        assert_eq!(parse_timestamp("00:01:00.000"), Some(60_000));
    }

    #[test]
    fn parse_timestamp_one_hour() {
        assert_eq!(parse_timestamp("01:00:00.000"), Some(3_600_000));
    }

    #[test]
    fn parse_timestamp_combined() {
        assert_eq!(parse_timestamp("01:01:01.500"), Some(3_661_500));
    }

    #[test]
    fn parse_timestamp_invalid_missing_dot() {
        assert_eq!(parse_timestamp("00:00:01"), None);
    }

    #[test]
    fn parse_timestamp_invalid_non_numeric() {
        assert_eq!(parse_timestamp("xx:00:00.000"), None);
    }

    #[test]
    fn parse_timestamp_invalid_wrong_parts() {
        assert_eq!(parse_timestamp("00:00"), None);
    }

    #[test]
    fn parse_timestamp_roundtrips() {
        assert_eq!(parse_timestamp(&ms_to_timestamp(3_661_500)), Some(3_661_500));
    }

    // --- import_markers_from_reader tests ---

    #[test]
    fn import_single_row_produces_one_segment() {
        let csv = "1,00:00:00.000,00:00:05.000,My Segment\n";
        let result = import_markers_from_reader(csv.as_bytes()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_ms, 0);
        assert_eq!(result[0].end_ms, 5_000);
        assert_eq!(result[0].title, "My Segment");
    }

    #[test]
    fn import_multiple_rows_preserves_order() {
        let csv = "1,00:00:00.000,00:00:05.000,First\n2,00:00:06.000,00:00:10.000,Second\n";
        let result = import_markers_from_reader(csv.as_bytes()).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].title, "First");
        assert_eq!(result[1].title, "Second");
    }

    #[test]
    fn import_row_with_comma_in_title() {
        let csv = "1,00:00:00.000,00:00:05.000,\"Hello, World\"\n";
        let result = import_markers_from_reader(csv.as_bytes()).unwrap();
        assert_eq!(result[0].title, "Hello, World");
    }

    #[test]
    fn import_empty_reader_returns_empty_vec() {
        let result = import_markers_from_reader("".as_bytes()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn import_invalid_start_timestamp_returns_error() {
        let csv = "1,xx:xx:xx.xxx,00:00:05.000,Test\n";
        let result = import_markers_from_reader(csv.as_bytes());
        assert!(result.is_err());
    }

    #[test]
    fn import_invalid_end_timestamp_returns_error() {
        let csv = "1,00:00:00.000,xx:xx:xx.xxx,Test\n";
        let result = import_markers_from_reader(csv.as_bytes());
        assert!(result.is_err());
    }

    #[test]
    fn import_roundtrips_write_then_read() {
        let original = vec![
            seg(0, 5_000, "001 Segment"),
            seg(6_000, 10_000, "002 Segment"),
        ];
        let mut buf: Vec<u8> = Vec::new();
        write_csv(&mut buf, &original).unwrap();
        let imported = import_markers_from_reader(buf.as_slice()).unwrap();
        assert_eq!(imported.len(), original.len());
        for (imp, orig) in imported.iter().zip(original.iter()) {
            assert_eq!(imp.start_ms, orig.start_ms);
            assert_eq!(imp.end_ms, orig.end_ms);
            assert_eq!(imp.title, orig.title);
        }
    }
}
