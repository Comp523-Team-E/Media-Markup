import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { appState } from '$lib/state.svelte';
import {
  enterEditMode,
  cancelEditMode,
  confirmEditMode,
  nudgeMarker,
  moveEditingMarkerToMs,
  computePreviewSegments,
} from '$lib/actions';
import { resetAppState } from '../helpers/reset-state';
import type { Marker } from '$lib/types';

function marker(id: string, position: number, kind: Marker['kind'] = 'start'): Marker {
  return { id, position, kind };
}

// Flush multiple microtask ticks to allow nested async chains to settle
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  resetAppState();
});

// ---------------------------------------------------------------------------
// enterEditMode
// ---------------------------------------------------------------------------

describe('enterEditMode', () => {
  it('sets editingMarkerId to the given marker id', () => {
    appState.markers = [marker('m1', 3000)];
    enterEditMode('m1');
    expect(appState.editingMarkerId).toBe('m1');
  });

  it('copies the marker position into editingPositionMs', () => {
    appState.markers = [marker('m1', 3000)];
    enterEditMode('m1');
    expect(appState.editingPositionMs).toBe(3000);
  });

  it('also selects the marker in the panel', () => {
    appState.markers = [marker('m1', 3000)];
    enterEditMode('m1');
    expect(appState.selectedMarkerId).toBe('m1');
  });

  it('does nothing when the marker id is not found', () => {
    appState.markers = [];
    enterEditMode('nonexistent');
    expect(appState.editingMarkerId).toBeNull();
    expect(appState.editingPositionMs).toBe(0);
  });

  it('works when multiple markers exist — picks the correct one', () => {
    appState.markers = [marker('m1', 1000), marker('m2', 5000)];
    enterEditMode('m2');
    expect(appState.editingMarkerId).toBe('m2');
    expect(appState.editingPositionMs).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// cancelEditMode
// ---------------------------------------------------------------------------

describe('cancelEditMode', () => {
  it('clears editingMarkerId', () => {
    appState.editingMarkerId = 'm1';
    cancelEditMode();
    expect(appState.editingMarkerId).toBeNull();
  });

  it('resets editingPositionMs to 0', () => {
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000;
    cancelEditMode();
    expect(appState.editingPositionMs).toBe(0);
  });

  it('is a no-op when not in edit mode', () => {
    appState.editingMarkerId = null;
    appState.editingPositionMs = 0;
    cancelEditMode();
    expect(appState.editingMarkerId).toBeNull();
    expect(appState.editingPositionMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// confirmEditMode
// ---------------------------------------------------------------------------

describe('confirmEditMode', () => {
  it('does nothing when not in edit mode', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    appState.editingMarkerId = null;
    await confirmEditMode();
    expect(handler).not.toHaveBeenCalledWith('move_marker', expect.anything());
  });

  it('calls move_marker with the correct id and newPositionMs', async () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000;
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await confirmEditMode();
    expect(handler).toHaveBeenCalledWith('move_marker', { id: 'm1', newPositionMs: 5000 });
  });

  it('rounds a fractional position before sending', async () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000.7;
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await confirmEditMode();
    expect(handler).toHaveBeenCalledWith('move_marker', { id: 'm1', newPositionMs: 5001 });
  });

  it('updates the marker position in appState.markers', async () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 7000;
    mockIPC((cmd: string) => (cmd === 'validate_markers' ? [] : undefined));
    await confirmEditMode();
    expect(appState.markers.find(m => m.id === 'm1')?.position).toBe(7000);
  });

  it('re-sorts markers by position after the update', async () => {
    appState.markers = [marker('m1', 1000), marker('m2', 5000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 8000; // move m1 after m2
    mockIPC((cmd: string) => (cmd === 'validate_markers' ? [] : undefined));
    await confirmEditMode();
    expect(appState.markers[0].id).toBe('m2');
    expect(appState.markers[1].id).toBe('m1');
  });

  it('clears editingMarkerId on success', async () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000;
    mockIPC((cmd: string) => (cmd === 'validate_markers' ? [] : undefined));
    await confirmEditMode();
    expect(appState.editingMarkerId).toBeNull();
  });

  it('resets editingPositionMs to 0 on success', async () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000;
    mockIPC((cmd: string) => (cmd === 'validate_markers' ? [] : undefined));
    await confirmEditMode();
    expect(appState.editingPositionMs).toBe(0);
  });

  it('calls validate_markers after moving', async () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000;
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await confirmEditMode();
    expect(handler).toHaveBeenCalledWith('validate_markers', expect.anything());
  });

  it('sets appState.error when move_marker throws', async () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000;
    mockIPC(() => { throw new Error('move failed'); });
    await confirmEditMode();
    expect(appState.error).toMatch('move failed');
  });

  it('does not move the playhead when confirmed after a waveform click', async () => {
    // Regression: when the user clicks the waveform to reposition a marker and
    // then presses Enter, confirmEditMode must not touch positionMs.  The bug
    // was that the waveform pointer-down handler set waveformDragging=true before
    // the edit-mode early-return; if Enter was pressed while the pointer was still
    // captured, handlePointerUp fired after editingMarkerId was already null and
    // fell through to the seek path, snapping the playhead to the mouse position.
    appState.markers = [marker('m1', 3000)];
    appState.positionMs = 15_000; // playhead far from the marker
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 8_000; // moved to new position via waveform click
    // Simulate the race-condition state: pointer is still captured (dragging=true)
    // even though confirmEditMode is about to run
    appState.waveformDragging = true;
    mockIPC((cmd: string) => (cmd === 'validate_markers' ? [] : undefined));
    await confirmEditMode();
    // positionMs must not have changed regardless of waveformDragging state
    expect(appState.positionMs).toBe(15_000);
    // waveformDragging must also have been left alone by confirmEditMode
    // (the component's pointer-up handler is responsible for clearing it)
    expect(appState.waveformDragging).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// nudgeMarker
// ---------------------------------------------------------------------------

describe('nudgeMarker', () => {
  it('does nothing when no marker is being edited and none is selected', () => {
    appState.durationMs = 60_000;
    nudgeMarker(1);
    expect(appState.editingMarkerId).toBeNull();
    expect(appState.editingPositionMs).toBe(0);
  });

  it('auto-enters edit mode for the selected marker when not already editing', () => {
    appState.markers = [marker('m1', 3000)];
    appState.selectedMarkerId = 'm1';
    appState.durationMs = 60_000;
    nudgeMarker(1);
    expect(appState.editingMarkerId).toBe('m1');
  });

  it('nudges right by nudgeStepMs (100ms)', () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 3000;
    appState.durationMs = 60_000;
    nudgeMarker(1);
    expect(appState.editingPositionMs).toBe(3100);
  });

  it('nudges left by nudgeStepMs (100ms)', () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 3000;
    appState.durationMs = 60_000;
    nudgeMarker(-1);
    expect(appState.editingPositionMs).toBe(2900);
  });

  it('clamps to 0 when nudging left past the start', () => {
    appState.markers = [marker('m1', 50)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 50;
    appState.durationMs = 60_000;
    nudgeMarker(-1);
    expect(appState.editingPositionMs).toBe(0);
  });

  it('clamps to durationMs when nudging right past the end', () => {
    appState.markers = [marker('m1', 59_950)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 59_950;
    appState.durationMs = 60_000;
    nudgeMarker(1);
    expect(appState.editingPositionMs).toBe(60_000);
  });

  it('auto-enters and then nudges in one call (combined behaviour)', () => {
    appState.markers = [marker('m1', 3000)];
    appState.selectedMarkerId = 'm1';
    appState.durationMs = 60_000;
    nudgeMarker(-1);
    // After auto-entry, editingPositionMs starts at 3000 then nudges -100
    expect(appState.editingPositionMs).toBe(2900);
  });
});

// ---------------------------------------------------------------------------
// moveEditingMarkerToMs
// ---------------------------------------------------------------------------

describe('moveEditingMarkerToMs', () => {
  it('does nothing when not in edit mode', () => {
    appState.editingMarkerId = null;
    appState.editingPositionMs = 0;
    appState.durationMs = 60_000;
    moveEditingMarkerToMs(5000);
    expect(appState.editingPositionMs).toBe(0);
  });

  it('updates editingPositionMs to the given value when in edit mode', () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 3000;
    appState.durationMs = 60_000;
    moveEditingMarkerToMs(8000);
    expect(appState.editingPositionMs).toBe(8000);
  });

  it('clamps to 0 when given a negative value', () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 3000;
    appState.durationMs = 60_000;
    moveEditingMarkerToMs(-500);
    expect(appState.editingPositionMs).toBe(0);
  });

  it('clamps to durationMs when given a value past the end', () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 3000;
    appState.durationMs = 60_000;
    moveEditingMarkerToMs(99_000);
    expect(appState.editingPositionMs).toBe(60_000);
  });

  it('accepts a value exactly at 0', () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 3000;
    appState.durationMs = 60_000;
    moveEditingMarkerToMs(0);
    expect(appState.editingPositionMs).toBe(0);
  });

  it('accepts a value exactly at durationMs', () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 3000;
    appState.durationMs = 60_000;
    moveEditingMarkerToMs(60_000);
    expect(appState.editingPositionMs).toBe(60_000);
  });

  it('does not alter positionMs (playback position)', () => {
    appState.markers = [marker('m1', 3000)];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 3000;
    appState.positionMs = 1000;
    appState.durationMs = 60_000;
    moveEditingMarkerToMs(20_000);
    expect(appState.positionMs).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// computePreviewSegments
// ---------------------------------------------------------------------------

describe('computePreviewSegments', () => {
  it('returns validated segments unchanged when not in edit mode', () => {
    const segs = [{ startMs: 0, endMs: 1000, title: 'A' }];
    appState.segments = segs;
    appState.editingMarkerId = null;
    expect(computePreviewSegments()).toEqual(segs);
  });

  it('falls back to partial segments when not editing and segments is null', () => {
    appState.segments = null;
    appState.editingMarkerId = null;
    appState.markers = [marker('s1', 0, 'start'), marker('e1', 1000, 'end')];
    appState.renameInputs = { s1: 'A' };
    const result = computePreviewSegments();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ startMs: 0, endMs: 1000, title: 'A' });
  });

  it('swaps in editingPositionMs for the editing end marker', () => {
    appState.markers = [marker('s1', 1000, 'start'), marker('e1', 5000, 'end')];
    appState.renameInputs = { s1: 'Clip' };
    appState.editingMarkerId = 'e1';
    appState.editingPositionMs = 7000;
    const result = computePreviewSegments();
    expect(result).toHaveLength(1);
    expect(result[0].endMs).toBe(7000);
    expect(result[0].startMs).toBe(1000);
  });

  it('swaps in editingPositionMs for the editing start marker', () => {
    appState.markers = [marker('s1', 1000, 'start'), marker('e1', 5000, 'end')];
    appState.renameInputs = { s1: 'Clip' };
    appState.editingMarkerId = 's1';
    appState.editingPositionMs = 3000;
    const result = computePreviewSegments();
    expect(result).toHaveLength(1);
    expect(result[0].startMs).toBe(3000);
    expect(result[0].endMs).toBe(5000);
  });

  it('re-sorts markers after swapping so segment boundaries stay correct', () => {
    // Move the start marker past the end marker — they should swap roles in output
    appState.markers = [marker('s1', 1000, 'start'), marker('e1', 5000, 'end')];
    appState.renameInputs = {};
    appState.editingMarkerId = 's1';
    appState.editingPositionMs = 7000; // now s1 is after e1
    const result = computePreviewSegments();
    // After sort, e1 (5000) comes before s1 (7000) — orphaned end produces no segment
    expect(result).toHaveLength(0);
  });

  it('does not mutate appState.markers', () => {
    appState.markers = [marker('s1', 1000, 'start'), marker('e1', 5000, 'end')];
    appState.editingMarkerId = 's1';
    appState.editingPositionMs = 2000;
    computePreviewSegments();
    expect(appState.markers[0].position).toBe(1000);
    expect(appState.markers[1].position).toBe(5000);
  });

  it('handles a startEnd marker being edited', () => {
    appState.markers = [marker('b1', 3000, 'startEnd')];
    appState.renameInputs = { b1: 'Beat' };
    appState.editingMarkerId = 'b1';
    appState.editingPositionMs = 6000;
    const result = computePreviewSegments();
    expect(result).toHaveLength(1);
    expect(result[0].startMs).toBe(6000);
    expect(result[0].endMs).toBe(6000);
  });

  it('returns empty array when editing leaves an unmatched start', () => {
    appState.markers = [marker('s1', 1000, 'start')];
    appState.editingMarkerId = 's1';
    appState.editingPositionMs = 2000;
    expect(computePreviewSegments()).toEqual([]);
  });

  it('closes the pending segment at an edited startEnd marker then opens a new one', () => {
    appState.markers = [marker('s1', 0, 'start'), marker('b1', 3000, 'startEnd'), marker('e1', 6000, 'end')];
    appState.renameInputs = { s1: 'Intro', b1: 'Chorus' };
    appState.editingMarkerId = 'b1';
    appState.editingPositionMs = 4000;
    const result = computePreviewSegments();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ startMs: 0, endMs: 4000, title: 'Intro' });
    expect(result[1]).toEqual({ startMs: 4000, endMs: 6000, title: 'Chorus' });
  });
});
