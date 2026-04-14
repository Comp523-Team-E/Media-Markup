use std::collections::HashMap;
use uuid::Uuid;

use crate::error::{AppError, Result};
use super::model::{Marker, MarkerKind, Segment};
use super::validate::to_segments;

pub struct MarkerStore {
    /// Markers kept sorted by position at all times.
    markers: Vec<Marker>,
    /// Segment titles keyed by the anchor marker's ID.
    /// Anchor = the `Start` marker in a Start/End pair, or a `StartEnd` marker.
    /// `End` markers never have an entry here.
    /// Only populated when the user explicitly renames a segment.
    titles: HashMap<Uuid, String>,
}

impl MarkerStore {
    pub fn new() -> Self {
        Self {
            markers: Vec::new(),
            titles: HashMap::new(),
        }
    }

    /// Add a marker at `position` ms with the given kind.
    pub fn add(&mut self, position: u64, kind: MarkerKind) -> Marker {
        let marker = Marker { id: Uuid::new_v4(), position, kind };

        // Insert in sorted position order.
        let pos = self.markers.partition_point(|m| m.position <= position);
        self.markers.insert(pos, marker.clone());
        marker
    }

    /// Remove a marker (and its title entry if it is an anchor).
    pub fn remove(&mut self, id: Uuid) -> Result<()> {
        let idx = self
            .markers
            .iter()
            .position(|m| m.id == id)
            .ok_or(AppError::MarkerNotFound(id))?;
        self.markers.remove(idx);
        self.titles.remove(&id);
        Ok(())
    }

    /// Move a marker to a new position, re-sorting the list. Title is preserved.
    pub fn move_marker(&mut self, id: Uuid, new_position: u64) -> Result<()> {
        // Capture kind before removal.
        let kind = self
            .markers
            .iter()
            .find(|m| m.id == id)
            .map(|m| m.kind)
            .ok_or(AppError::MarkerNotFound(id))?;

        // Remove the old entry.
        let idx = self.markers.iter().position(|m| m.id == id).unwrap();
        self.markers.remove(idx);

        // Re-insert at the correct sorted position.
        let insert_at = self.markers.partition_point(|m| m.position <= new_position);
        self.markers.insert(insert_at, Marker { id, position: new_position, kind });
        Ok(())
    }

    /// Rename the segment anchored by `anchor_id`.
    /// Returns an error if `anchor_id` belongs to an `End` marker or does not exist.
    pub fn rename_segment(&mut self, anchor_id: Uuid, title: String) -> Result<()> {
        let kind = self
            .markers
            .iter()
            .find(|m| m.id == anchor_id)
            .map(|m| m.kind)
            .ok_or(AppError::MarkerNotFound(anchor_id))?;

        if matches!(kind, MarkerKind::End) {
            return Err(AppError::ValidationError(
                "Cannot rename: marker is an End marker and does not anchor a segment".into(),
            ));
        }

        self.titles.insert(anchor_id, title);
        Ok(())
    }

    /// Remove all markers and titles.
    pub fn clear(&mut self) {
        self.markers.clear();
        self.titles.clear();
    }

    /// Return all markers in sorted order.
    pub fn list(&self) -> &[Marker] {
        &self.markers
    }

    /// Validate markers and return resolved segments.
    pub fn to_segments(&self) -> Result<Vec<Segment>> {
        to_segments(&self.markers, &self.titles)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_inserts_sorted() {
        let mut store = MarkerStore::new();
        store.add(5000, MarkerKind::End);
        store.add(1000, MarkerKind::Start);
        store.add(3000, MarkerKind::End);
        let positions: Vec<u64> = store.list().iter().map(|m| m.position).collect();
        assert_eq!(positions, vec![1000, 3000, 5000]);
    }

    #[test]
    fn no_auto_titles_stored_for_new_markers() {
        let mut store = MarkerStore::new();
        let m1 = store.add(0, MarkerKind::Start);
        let m2 = store.add(1000, MarkerKind::StartEnd);
        let m3 = store.add(2000, MarkerKind::End);
        // Titles are only stored when explicitly renamed; new markers have none.
        assert!(!store.titles.contains_key(&m1.id));
        assert!(!store.titles.contains_key(&m2.id));
        assert!(!store.titles.contains_key(&m3.id));
    }

    #[test]
    fn remove_deletes_marker_and_title() {
        let mut store = MarkerStore::new();
        let m = store.add(1000, MarkerKind::Start);
        store.remove(m.id).unwrap();
        assert!(store.list().is_empty());
        assert!(!store.titles.contains_key(&m.id));
    }

    #[test]
    fn remove_unknown_id_returns_error() {
        let mut store = MarkerStore::new();
        let result = store.remove(Uuid::new_v4());
        assert!(result.is_err());
    }

    #[test]
    fn move_marker_re_sorts() {
        let mut store = MarkerStore::new();
        let s = store.add(1000, MarkerKind::Start);
        store.add(3000, MarkerKind::End);
        store.move_marker(s.id, 5000).unwrap();
        assert_eq!(store.list()[0].position, 3000);
        assert_eq!(store.list()[1].position, 5000);
    }

    #[test]
    fn move_marker_preserves_title() {
        let mut store = MarkerStore::new();
        let s = store.add(1000, MarkerKind::Start);
        store.rename_segment(s.id, "Custom Title".into()).unwrap();
        store.move_marker(s.id, 2000).unwrap();
        assert_eq!(store.titles[&s.id], "Custom Title");
    }

    #[test]
    fn rename_segment_updates_title() {
        let mut store = MarkerStore::new();
        let s = store.add(0, MarkerKind::Start);
        store.rename_segment(s.id, "My Segment".into()).unwrap();
        assert_eq!(store.titles[&s.id], "My Segment");
    }

    #[test]
    fn rename_end_marker_returns_error() {
        let mut store = MarkerStore::new();
        let e = store.add(1000, MarkerKind::End);
        let result = store.rename_segment(e.id, "Should fail".into());
        assert!(result.is_err());
    }

    #[test]
    fn to_segments_valid_pair() {
        let mut store = MarkerStore::new();
        store.add(0, MarkerKind::Start);
        store.add(5000, MarkerKind::End);
        let segments = store.to_segments().unwrap();
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].start_ms, 0);
        assert_eq!(segments[0].end_ms, 5000);
    }

    #[test]
    fn to_segments_empty_store() {
        let store = MarkerStore::new();
        let segments = store.to_segments().unwrap();
        assert!(segments.is_empty());
    }

    #[test]
    fn rename_nonexistent_marker_returns_error() {
        let mut store = MarkerStore::new();
        let result = store.rename_segment(Uuid::new_v4(), "anything".into());
        assert!(matches!(result, Err(crate::error::AppError::MarkerNotFound(_))));
    }

    #[test]
    fn move_nonexistent_marker_returns_error() {
        let mut store = MarkerStore::new();
        let result = store.move_marker(Uuid::new_v4(), 1000);
        assert!(matches!(result, Err(crate::error::AppError::MarkerNotFound(_))));
    }

    #[test]
    fn clear_removes_all_markers_and_titles() {
        let mut store = MarkerStore::new();
        let s = store.add(0, MarkerKind::Start);
        store.add(5000, MarkerKind::End);
        store.rename_segment(s.id, "My Segment".into()).unwrap();
        store.clear();
        assert!(store.list().is_empty());
        assert!(store.titles.is_empty());
    }
}
