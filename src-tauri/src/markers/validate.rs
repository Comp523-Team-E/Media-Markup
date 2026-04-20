use crate::error::{AppError, Result};
use super::model::{Marker, MarkerKind, Segment};
use std::collections::HashMap;
use uuid::Uuid;

/// Pair sorted markers into validated segments using a stack (valid-parentheses model).
///
/// Rules:
/// - `Start` pushes onto the open-segment stack.
/// - `End` pops the most-recently-opened start and closes a segment.
///   An `End` with nothing on the stack is an error.
/// - `StartEnd` closes the most-recently-opened start (if any) and pushes
///   itself as a new open start.  A standalone `StartEnd` (empty stack) emits
///   a zero-span segment without opening a new pending start.
/// - Any starts remaining on the stack after all markers are processed are errors.
///
/// Segments may overlap when multiple starts are open simultaneously.
pub fn to_segments(
    markers: &[Marker],
    titles: &HashMap<Uuid, String>,
) -> Result<Vec<Segment>> {
    let mut stack: Vec<&Marker> = Vec::new();
    let mut segments: Vec<Segment> = Vec::new();

    for m in markers {
        match m.kind {
            MarkerKind::Start => {
                stack.push(m);
            }
            MarkerKind::End => {
                match stack.pop() {
                    None => {
                        return Err(AppError::ValidationError(
                            "End marker found with no preceding Start marker".into(),
                        ));
                    }
                    Some(start) => {
                        let title = titles
                            .get(&start.id)
                            .cloned()
                            .unwrap_or_else(|| format!("Segment {}", segments.len()));
                        segments.push(Segment {
                            start_ms: start.position,
                            end_ms: m.position,
                            title,
                        });
                    }
                }
            }
            MarkerKind::StartEnd => {
                if let Some(start) = stack.pop() {
                    // Closes the most-recent open segment and opens a new one.
                    let title = titles
                        .get(&start.id)
                        .cloned()
                        .unwrap_or_else(|| format!("Segment {}", segments.len()));
                    segments.push(Segment {
                        start_ms: start.position,
                        end_ms: m.position,
                        title,
                    });
                    stack.push(m);
                } else {
                    // Standalone StartEnd with nothing open: zero-span segment.
                    let title = titles
                        .get(&m.id)
                        .cloned()
                        .unwrap_or_else(|| format!("Segment {}", segments.len()));
                    segments.push(Segment {
                        start_ms: m.position,
                        end_ms: m.position,
                        title,
                    });
                }
            }
        }
    }

    if let Some(unmatched) = stack.first() {
        return Err(AppError::ValidationError(format!(
            "Unmatched Start marker at position {} ms has no corresponding End marker",
            unmatched.position
        )));
    }

    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn marker(position: u64, kind: MarkerKind) -> Marker {
        Marker { id: Uuid::new_v4(), position, kind }
    }

    fn titled(m: &Marker, titles: &mut HashMap<Uuid, String>, title: &str) {
        titles.insert(m.id, title.to_string());
    }

    #[test]
    fn empty_markers_returns_empty_segments() {
        let result = to_segments(&[], &HashMap::new());
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn valid_start_end_pair_produces_one_segment() {
        let start = marker(1000, MarkerKind::Start);
        let end = marker(5000, MarkerKind::End);
        let mut titles = HashMap::new();
        titled(&start, &mut titles, "001 Segment");
        let segments = to_segments(&[start, end], &titles).unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].start_ms, 1000);
        assert_eq!(segments[0].end_ms, 5000);
        assert_eq!(segments[0].title, "001 Segment");
    }

    #[test]
    fn startend_produces_zero_span_segment() {
        let m = marker(3000, MarkerKind::StartEnd);
        let mut titles = HashMap::new();
        titled(&m, &mut titles, "001 Segment");
        let segments = to_segments(&[m], &titles).unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].start_ms, 3000);
        assert_eq!(segments[0].end_ms, 3000);
    }

    #[test]
    fn multiple_valid_pairs_produce_multiple_segments() {
        let s1 = marker(0, MarkerKind::Start);
        let e1 = marker(1000, MarkerKind::End);
        let s2 = marker(2000, MarkerKind::Start);
        let e2 = marker(3000, MarkerKind::End);
        let mut titles = HashMap::new();
        titled(&s1, &mut titles, "001 Segment");
        titled(&s2, &mut titles, "002 Segment");
        let segments = to_segments(&[s1, e1, s2, e2], &titles).unwrap();
        assert_eq!(segments.len(), 2);
    }

    #[test]
    fn end_before_start_is_error() {
        let end = marker(1000, MarkerKind::End);
        let result = to_segments(&[end], &HashMap::new());
        assert!(result.is_err());
    }

    #[test]
    fn two_starts_with_no_matching_ends_is_error() {
        // Both starts are unmatched — the outermost (earliest) is reported.
        let s1 = marker(1000, MarkerKind::Start);
        let s2 = marker(2000, MarkerKind::Start);
        let result = to_segments(&[s1, s2], &HashMap::new());
        assert!(result.is_err());
    }

    #[test]
    fn overlapping_segments_are_valid() {
        // start → start → end → end produces two overlapping segments.
        let s1 = marker(0, MarkerKind::Start);
        let s2 = marker(1000, MarkerKind::Start);
        let e1 = marker(4000, MarkerKind::End);
        let e2 = marker(5000, MarkerKind::End);
        let mut titles = HashMap::new();
        titled(&s1, &mut titles, "Outer");
        titled(&s2, &mut titles, "Inner");
        let segments = to_segments(&[s1, s2, e1, e2], &titles).unwrap();
        assert_eq!(segments.len(), 2);
        // Inner segment: s2 closed by the first end
        assert_eq!(segments[0].start_ms, 1000);
        assert_eq!(segments[0].end_ms, 4000);
        assert_eq!(segments[0].title, "Inner");
        // Outer segment: s1 closed by the second end
        assert_eq!(segments[1].start_ms, 0);
        assert_eq!(segments[1].end_ms, 5000);
        assert_eq!(segments[1].title, "Outer");
    }

    #[test]
    fn unmatched_start_at_end_is_error() {
        let s = marker(1000, MarkerKind::Start);
        let result = to_segments(&[s], &HashMap::new());
        assert!(result.is_err());
    }

    #[test]
    fn startend_without_closing_end_is_error() {
        // start → startEnd creates a segment then pushes startEnd as new open start.
        // Without a following end, the startEnd is unmatched.
        let s = marker(1000, MarkerKind::Start);
        let se = marker(2000, MarkerKind::StartEnd);
        let result = to_segments(&[s, se], &HashMap::new());
        assert!(result.is_err());
    }

    #[test]
    fn untitled_start_end_pair_uses_generated_title() {
        // Exercises the unwrap_or_else fallback in the WaitingForEnd+End branch
        let s = marker(0, MarkerKind::Start);
        let e = marker(1000, MarkerKind::End);
        let segments = to_segments(&[s, e], &HashMap::new()).unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].title, "Segment 0");
    }

    #[test]
    fn untitled_startend_uses_generated_title() {
        // Exercises the unwrap_or_else fallback in the Idle+StartEnd branch
        let m = marker(500, MarkerKind::StartEnd);
        let segments = to_segments(&[m], &HashMap::new()).unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].title, "Segment 0");
    }

    #[test]
    fn start_then_titled_startend_emits_titled_segment() {
        // Exercises the WaitingForEnd+StartEnd branch WITH a title on the Start marker
        let s = marker(0, MarkerKind::Start);
        let se = marker(1000, MarkerKind::StartEnd);
        let end = marker(2000, MarkerKind::End);
        let mut titles = HashMap::new();
        titled(&s, &mut titles, "First");
        let segments = to_segments(&[s, se, end], &titles).unwrap();
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].title, "First");
    }
}
