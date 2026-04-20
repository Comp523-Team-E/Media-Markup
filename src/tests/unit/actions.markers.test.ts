import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { appState } from '$lib/state.svelte';
import {
  addMarkerAt, addMarkerNoKind, deleteMarker,
  renameSegment, computePartialSegments, revalidate, splitStartEndMarker,
} from '$lib/actions';
import { resetAppState } from '../helpers/reset-state';
import type { Marker } from '$lib/types';

function marker(id: string, position: number, kind: Marker['kind'] = 'start'): Marker {
  return { id, position, kind };
}

beforeEach(() => {
  resetAppState();
});

describe('addMarkerAt', () => {
  it('appends the returned marker sorted by position', async () => {
    appState.markers = [marker('existing', 5000, 'end')];
    mockIPC(() => marker('m1', 3000, 'start'));
    await addMarkerAt('start', 3000);
    expect(appState.markers).toHaveLength(2);
    expect(appState.markers[0].id).toBe('m1');  // 3000 < 5000
  });

  it('adds a renameInputs entry for start markers', async () => {
    mockIPC(() => marker('m1', 1000, 'start'));
    await addMarkerAt('start', 1000);
    expect(appState.renameInputs['m1']).toBe('');
  });

  it('adds a renameInputs entry for startEnd markers', async () => {
    mockIPC(() => marker('m1', 1000, 'startEnd'));
    await addMarkerAt('startEnd', 1000);
    expect(appState.renameInputs['m1']).toBe('');
  });

  it('does not add a renameInputs entry for end markers', async () => {
    mockIPC(() => marker('e1', 2000, 'end'));
    await addMarkerAt('end', 2000);
    expect(appState.renameInputs['e1']).toBeUndefined();
  });

  it('sets selectedMarkerId to the new marker id', async () => {
    mockIPC(() => marker('m1', 1000, 'start'));
    await addMarkerAt('start', 1000);
    expect(appState.selectedMarkerId).toBe('m1');
  });

  it('calls validate_markers after adding', async () => {
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'add_marker') return marker('m1', 1000, 'start');
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await addMarkerAt('start', 1000);
    expect(handler).toHaveBeenCalledWith('validate_markers', expect.anything());
  });

  it('sends the rounded position to invoke', async () => {
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'add_marker') return marker('m1', 1500, 'start');
      return undefined;
    });
    mockIPC(handler);
    await addMarkerAt('start', 1500.7);
    expect(handler).toHaveBeenCalledWith('add_marker', { positionMs: 1501, kind: 'start' });
  });

  it('sets appState.error when invoke throws', async () => {
    mockIPC(() => { throw new Error('backend error'); });
    await addMarkerAt('start', 1000);
    expect(appState.error).toMatch('backend error');
  });
});

describe('addMarkerNoKind', () => {
  it('adds the marker to unkindedMarkers', async () => {
    mockIPC((cmd: string) => {
      if (cmd === 'add_marker') return marker('m1', 0, 'start');
      return undefined;
    });
    await addMarkerNoKind();
    expect(appState.unkindedMarkers.has('m1')).toBe(true);
  });

  it('initializes renameInputs entry as empty string', async () => {
    mockIPC((cmd: string) => {
      if (cmd === 'add_marker') return marker('m1', 0, 'start');
      return undefined;
    });
    await addMarkerNoKind();
    expect(appState.renameInputs['m1']).toBe('');
  });

  it('sets selectedMarkerId', async () => {
    mockIPC((cmd: string) => {
      if (cmd === 'add_marker') return marker('m1', 0, 'start');
      return undefined;
    });
    await addMarkerNoKind();
    expect(appState.selectedMarkerId).toBe('m1');
  });
});

describe('deleteMarker', () => {
  it('removes the marker from appState.markers', async () => {
    appState.markers = [marker('m1', 1000), marker('m2', 2000)];
    mockIPC(() => undefined);
    await deleteMarker('m1');
    expect(appState.markers).toHaveLength(1);
    expect(appState.markers[0].id).toBe('m2');
  });

  it('removes the marker from renameInputs', async () => {
    appState.markers = [marker('m1', 1000)];
    appState.renameInputs = { m1: 'Intro', m2: 'Outro' };
    mockIPC(() => undefined);
    await deleteMarker('m1');
    expect(appState.renameInputs['m1']).toBeUndefined();
    expect(appState.renameInputs['m2']).toBe('Outro');
  });

  it('clears selectedMarkerId when deleting the selected marker', async () => {
    appState.markers = [marker('m1', 1000)];
    appState.selectedMarkerId = 'm1';
    mockIPC(() => undefined);
    await deleteMarker('m1');
    expect(appState.selectedMarkerId).toBeNull();
  });

  it('does not clear selectedMarkerId when deleting a different marker', async () => {
    appState.markers = [marker('m1', 1000), marker('m2', 2000)];
    appState.selectedMarkerId = 'm2';
    mockIPC(() => undefined);
    await deleteMarker('m1');
    expect(appState.selectedMarkerId).toBe('m2');
  });

  it('removes the marker from unkindedMarkers', async () => {
    appState.markers = [marker('m1', 1000)];
    appState.unkindedMarkers = new Set(['m1']);
    mockIPC(() => undefined);
    await deleteMarker('m1');
    expect(appState.unkindedMarkers.has('m1')).toBe(false);
  });

  it('calls validate_markers after deleting', async () => {
    appState.markers = [marker('m1', 1000)];
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await deleteMarker('m1');
    expect(handler).toHaveBeenCalledWith('validate_markers', expect.anything());
  });

  it('sets appState.error when invoke throws', async () => {
    appState.markers = [marker('m1', 1000)];
    mockIPC(() => { throw new Error('delete failed'); });
    await deleteMarker('m1');
    expect(appState.error).toMatch('delete failed');
  });

  it('clears editingMarkerId when deleting the marker currently being edited', async () => {
    appState.markers = [marker('m1', 1000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 2000;
    mockIPC(() => undefined);
    await deleteMarker('m1');
    expect(appState.editingMarkerId).toBeNull();
    expect(appState.editingPositionMs).toBe(0);
  });

  it('does not clear editingMarkerId when deleting a different marker', async () => {
    appState.markers = [marker('m1', 1000), marker('m2', 2000)];
    appState.editingMarkerId = 'm2';
    appState.editingPositionMs = 3000;
    mockIPC(() => undefined);
    await deleteMarker('m1');
    expect(appState.editingMarkerId).toBe('m2');
    expect(appState.editingPositionMs).toBe(3000);
  });
});

describe('renameSegment', () => {
  it('calls rename_segment with anchorId and current renameInputs value', async () => {
    appState.renameInputs = { m1: 'Intro' };
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await renameSegment('m1');
    expect(handler).toHaveBeenCalledWith('rename_segment', { anchorId: 'm1', title: 'Intro' });
  });

  it('uses empty string when renameInputs has no entry', async () => {
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await renameSegment('missing');
    expect(handler).toHaveBeenCalledWith('rename_segment', { anchorId: 'missing', title: '' });
  });

  it('calls revalidate after rename', async () => {
    appState.renameInputs = { m1: 'Test' };
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await renameSegment('m1');
    expect(handler).toHaveBeenCalledWith('validate_markers', expect.anything());
  });

  it('sets appState.error when invoke throws', async () => {
    mockIPC(() => { throw new Error('rename failed'); });
    await renameSegment('m1');
    expect(appState.error).toMatch('rename failed');
  });
});

describe('computePartialSegments', () => {
  it('returns empty array when there are no markers', () => {
    appState.markers = [];
    expect(computePartialSegments()).toEqual([]);
  });

  it('creates a segment from a start+end pair', () => {
    appState.markers = [marker('s1', 1000, 'start'), marker('e1', 5000, 'end')];
    appState.renameInputs = { s1: 'Intro' };
    const segs = computePartialSegments();
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ startMs: 1000, endMs: 5000, title: 'Intro' });
  });

  it('uses a fallback title when renameInputs has no entry', () => {
    appState.markers = [marker('s1', 0, 'start'), marker('e1', 1000, 'end')];
    appState.renameInputs = {};
    const segs = computePartialSegments();
    expect(segs[0].title).toBe('Segment 0');
  });

  it('ignores an unpaired end marker', () => {
    appState.markers = [marker('e1', 5000, 'end')];
    expect(computePartialSegments()).toEqual([]);
  });

  it('ignores an unpaired start marker', () => {
    appState.markers = [marker('s1', 1000, 'start')];
    expect(computePartialSegments()).toEqual([]);
  });

  it('handles a standalone startEnd marker (creates zero-length segment)', () => {
    appState.markers = [marker('b1', 3000, 'startEnd')];
    appState.renameInputs = { b1: 'Beat' };
    const segs = computePartialSegments();
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ startMs: 3000, endMs: 3000, title: 'Beat' });
  });

  it('handles startEnd as boundary between two segments', () => {
    appState.markers = [
      marker('s1', 0, 'start'),
      marker('b1', 3000, 'startEnd'),
      marker('e1', 6000, 'end'),
    ];
    appState.renameInputs = { s1: 'A', b1: 'B' };
    const segs = computePartialSegments();
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ startMs: 0, endMs: 3000, title: 'A' });
    expect(segs[1]).toEqual({ startMs: 3000, endMs: 6000, title: 'B' });
  });

  it('sorts markers by position before computing', () => {
    appState.markers = [marker('e1', 5000, 'end'), marker('s1', 1000, 'start')];
    appState.renameInputs = { s1: 'Out of order' };
    const segs = computePartialSegments();
    expect(segs).toHaveLength(1);
    expect(segs[0].startMs).toBe(1000);
    expect(segs[0].endMs).toBe(5000);
  });

  it('produces two overlapping segments from start-start-end-end', () => {
    appState.markers = [
      marker('s1', 0, 'start'),
      marker('s2', 1000, 'start'),
      marker('e1', 4000, 'end'),
      marker('e2', 5000, 'end'),
    ];
    appState.renameInputs = { s1: 'Outer', s2: 'Inner' };
    const segs = computePartialSegments();
    expect(segs).toHaveLength(2);
    // LIFO: s2 closed by e1, s1 closed by e2
    expect(segs.find(s => s.startMs === 1000)).toEqual({ startMs: 1000, endMs: 4000, title: 'Inner' });
    expect(segs.find(s => s.startMs === 0)).toEqual({ startMs: 0, endMs: 5000, title: 'Outer' });
  });

  it('ignores an unmatched outer start when inner segment is complete', () => {
    appState.markers = [
      marker('s1', 0, 'start'),
      marker('s2', 1000, 'start'),
      marker('e1', 4000, 'end'),
    ];
    appState.renameInputs = { s1: 'Outer', s2: 'Inner' };
    const segs = computePartialSegments();
    // Only s2→e1 closes; s1 has no matching end so it is left on the stack
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ startMs: 1000, endMs: 4000, title: 'Inner' });
  });
});

describe('splitStartEndMarker', () => {
  it('is a no-op when the marker does not exist', async () => {
    mockIPC(() => undefined);
    await splitStartEndMarker('nonexistent');
    expect(appState.markers).toHaveLength(0);
  });

  it('is a no-op when the marker is not startEnd kind', async () => {
    appState.markers = [marker('s1', 1000, 'start')];
    mockIPC(() => undefined);
    await splitStartEndMarker('s1');
    expect(appState.markers).toHaveLength(1);
    expect(appState.markers[0].kind).toBe('start');
  });

  it('removes the startEnd marker', async () => {
    appState.markers = [marker('b1', 3000, 'startEnd')];
    appState.renameInputs = { b1: '' };
    let callCount = 0;
    mockIPC((cmd: string) => {
      if (cmd === 'delete_marker') return undefined;
      if (cmd === 'add_marker') {
        callCount++;
        return marker(`new${callCount}`, 3000, callCount === 1 ? 'end' : 'start');
      }
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    await splitStartEndMarker('b1');
    expect(appState.markers.find(m => m.id === 'b1')).toBeUndefined();
  });

  it('creates an end and a start marker at the same position', async () => {
    appState.markers = [marker('b1', 3000, 'startEnd')];
    appState.renameInputs = { b1: '' };
    let callCount = 0;
    mockIPC((cmd: string) => {
      if (cmd === 'delete_marker') return undefined;
      if (cmd === 'add_marker') {
        callCount++;
        return marker(`new${callCount}`, 3000, callCount === 1 ? 'end' : 'start');
      }
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    await splitStartEndMarker('b1');
    const kinds = appState.markers.map(m => m.kind).sort();
    expect(kinds).toEqual(['end', 'start']);
    expect(appState.markers.every(m => m.position === 3000)).toBe(true);
  });

  it('transfers the title from the startEnd marker to the new start marker', async () => {
    appState.markers = [marker('b1', 3000, 'startEnd')];
    appState.renameInputs = { b1: 'Chorus' };
    let callCount = 0;
    mockIPC((cmd: string) => {
      if (cmd === 'delete_marker') return undefined;
      if (cmd === 'add_marker') {
        callCount++;
        return marker(`new${callCount}`, 3000, callCount === 1 ? 'end' : 'start');
      }
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    await splitStartEndMarker('b1');
    const startMarker = appState.markers.find(m => m.kind === 'start');
    expect(startMarker).toBeDefined();
    expect(appState.renameInputs[startMarker!.id]).toBe('Chorus');
  });

  it('calls revalidate after splitting', async () => {
    appState.markers = [marker('b1', 3000, 'startEnd')];
    appState.renameInputs = { b1: '' };
    let callCount = 0;
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'delete_marker') return undefined;
      if (cmd === 'add_marker') {
        callCount++;
        return marker(`new${callCount}`, 3000, callCount === 1 ? 'end' : 'start');
      }
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await splitStartEndMarker('b1');
    expect(handler).toHaveBeenCalledWith('validate_markers', expect.anything());
  });
});

describe('revalidate', () => {
  it('sets appState.segments on success', async () => {
    const segments = [{ startMs: 0, endMs: 1000, title: 'A' }];
    mockIPC(() => segments);
    await revalidate();
    expect(appState.segments).toEqual(segments);
  });

  it('clears validationError on success', async () => {
    appState.validationError = 'old error';
    mockIPC(() => []);
    await revalidate();
    expect(appState.validationError).toBeNull();
  });

  it('sets validationError on failure', async () => {
    mockIPC(() => { throw new Error('invalid markers'); });
    await revalidate();
    expect(appState.validationError).toMatch('invalid markers');
  });

  it('falls back to computePartialSegments on failure', async () => {
    appState.markers = [marker('s1', 0, 'start'), marker('e1', 1000, 'end')];
    appState.renameInputs = { s1: 'Fallback' };
    mockIPC(() => { throw new Error('error'); });
    await revalidate();
    expect(appState.segments).not.toBeNull();
    expect(appState.segments![0]).toEqual({ startMs: 0, endMs: 1000, title: 'Fallback' });
  });
});
