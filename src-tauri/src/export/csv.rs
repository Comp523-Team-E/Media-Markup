use crate::error::Result;
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
}
