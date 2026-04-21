import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { appState } from '$lib/state.svelte';
import { handleKeydown } from '$lib/actions';
import { SPEEDS } from '$lib/utils';
import { resetAppState } from '../helpers/reset-state';
import type { FileMetadata } from '$lib/types';

const fakeMeta: FileMetadata = {
  fileName: 'audio.mp3',
  filePath: '/path/audio.mp3',
  durationMs: 60_000,
  sampleRate: 44100,
  channels: 2,
};

function keyEvent(key: string, extra: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
}

function spaceEvent(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
}

// Flush multiple microtask ticks to allow nested async chains to settle
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  resetAppState();
  // Most keyboard tests require a file to be loaded
  appState.metadata = fakeMeta;
});

describe('handleKeydown — guards', () => {
  it('ignores events from input elements', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    const e = spaceEvent();
    Object.defineProperty(e, 'target', { value: document.createElement('input') });
    handleKeydown(e);
    await flush();
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores events from textarea elements', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    const e = spaceEvent();
    Object.defineProperty(e, 'target', { value: document.createElement('textarea') });
    handleKeydown(e);
    await flush();
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores events from select elements', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    const e = spaceEvent();
    Object.defineProperty(e, 'target', { value: document.createElement('select') });
    handleKeydown(e);
    await flush();
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores all keys when metadata is null', async () => {
    appState.metadata = null;
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(spaceEvent());
    await flush();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('handleKeydown — playback', () => {
  it('Space calls play when paused', async () => {
    appState.isPlaying = false;
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(spaceEvent());
    await flush();
    expect(handler).toHaveBeenCalledWith('play', expect.anything());
  });

  it('Space calls pause when playing', async () => {
    appState.isPlaying = true;
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(spaceEvent());
    await flush();
    expect(handler).toHaveBeenCalledWith('pause', expect.anything());
  });
});

describe('handleKeydown — markers', () => {
  it('s adds a start marker', async () => {
    const returnedMarker = { id: 'm1', position: 0, kind: 'start' as const };
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'add_marker') return returnedMarker;
      return undefined;
    });
    mockIPC(handler);
    handleKeydown(keyEvent('s'));
    await flush();
    expect(handler).toHaveBeenCalledWith('add_marker', expect.objectContaining({ kind: 'start' }));
  });

  it('S (uppercase) also adds a start marker', async () => {
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'add_marker') return { id: 'm1', position: 0, kind: 'start' };
      return undefined;
    });
    mockIPC(handler);
    handleKeydown(keyEvent('S'));
    await flush();
    expect(handler).toHaveBeenCalledWith('add_marker', expect.objectContaining({ kind: 'start' }));
  });

  it('e adds an end marker', async () => {
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'add_marker') return { id: 'm1', position: 0, kind: 'end' };
      return undefined;
    });
    mockIPC(handler);
    handleKeydown(keyEvent('e'));
    await flush();
    expect(handler).toHaveBeenCalledWith('add_marker', expect.objectContaining({ kind: 'end' }));
  });

  it('b adds a startEnd marker', async () => {
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'add_marker') return { id: 'm1', position: 0, kind: 'startEnd' };
      return undefined;
    });
    mockIPC(handler);
    handleKeydown(keyEvent('b'));
    await flush();
    expect(handler).toHaveBeenCalledWith('add_marker', expect.objectContaining({ kind: 'startEnd' }));
  });

  it('Delete deletes the selected marker', async () => {
    appState.markers = [{ id: 'm1', position: 1000, kind: 'start' }];
    appState.selectedMarkerId = 'm1';
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(keyEvent('Delete'));
    await flush();
    expect(handler).toHaveBeenCalledWith('delete_marker', { id: 'm1' });
  });

  it('Backspace deletes the selected marker', async () => {
    appState.markers = [{ id: 'm1', position: 1000, kind: 'start' }];
    appState.selectedMarkerId = 'm1';
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(keyEvent('Backspace'));
    await flush();
    expect(handler).toHaveBeenCalledWith('delete_marker', { id: 'm1' });
  });

  it('Delete does nothing when no marker is selected', async () => {
    appState.selectedMarkerId = null;
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(keyEvent('Delete'));
    await flush();
    expect(handler).not.toHaveBeenCalledWith('delete_marker', expect.anything());
  });

  it('x splits a selected startEnd marker', async () => {
    appState.markers = [{ id: 'b1', position: 3000, kind: 'startEnd' }];
    appState.renameInputs = { b1: '' };
    appState.selectedMarkerId = 'b1';
    let callCount = 0;
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'delete_marker') return undefined;
      if (cmd === 'add_marker') {
        callCount++;
        return { id: `new${callCount}`, position: 3000, kind: callCount === 1 ? 'end' : 'start' };
      }
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    handleKeydown(keyEvent('x'));
    for (let i = 0; i < 40; i++) await Promise.resolve();
    expect(handler).toHaveBeenCalledWith('delete_marker', { id: 'b1' });
    expect(handler).toHaveBeenCalledWith('add_marker', expect.objectContaining({ kind: 'end' }));
    expect(handler).toHaveBeenCalledWith('add_marker', expect.objectContaining({ kind: 'start' }));
  });

  it('X (uppercase) also splits a selected startEnd marker', async () => {
    appState.markers = [{ id: 'b1', position: 3000, kind: 'startEnd' }];
    appState.renameInputs = { b1: '' };
    appState.selectedMarkerId = 'b1';
    let callCount = 0;
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'delete_marker') return undefined;
      if (cmd === 'add_marker') {
        callCount++;
        return { id: `new${callCount}`, position: 3000, kind: callCount === 1 ? 'end' : 'start' };
      }
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    handleKeydown(keyEvent('X'));
    for (let i = 0; i < 40; i++) await Promise.resolve();
    expect(handler).toHaveBeenCalledWith('delete_marker', { id: 'b1' });
  });

  it('x does nothing when no marker is selected', async () => {
    appState.selectedMarkerId = null;
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(keyEvent('x'));
    await flush();
    expect(handler).not.toHaveBeenCalledWith('delete_marker', expect.anything());
  });

  it('x does nothing when the selected marker is not startEnd', async () => {
    appState.markers = [{ id: 's1', position: 1000, kind: 'start' }];
    appState.selectedMarkerId = 's1';
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(keyEvent('x'));
    await flush();
    expect(handler).not.toHaveBeenCalledWith('delete_marker', expect.anything());
  });
});

describe('handleKeydown — seeking', () => {
  it('ArrowRight calls stepFwd', async () => {
    appState.positionMs = 5000;
    appState.stepMs = 5000;
    appState.durationMs = 60_000;
    mockIPC(() => undefined);
    handleKeydown(keyEvent('ArrowRight'));
    await flush();
    expect(appState.positionMs).toBe(10_000);
  });

  it('ArrowLeft calls stepBack', async () => {
    appState.positionMs = 10_000;
    appState.stepMs = 5000;
    appState.durationMs = 60_000;
    mockIPC(() => undefined);
    handleKeydown(keyEvent('ArrowLeft'));
    await flush();
    expect(appState.positionMs).toBe(5000);
  });

  it('d seeks to the previous marker', async () => {
    appState.markers = [{ id: 'a', position: 2000, kind: 'start' }];
    appState.positionMs = 5000;
    appState.durationMs = 10_000;
    mockIPC(() => undefined);
    handleKeydown(keyEvent('d'));
    await flush();
    expect(appState.positionMs).toBe(2000);
    expect(appState.selectedMarkerId).toBe('a');
  });

  it('f seeks to the next marker', async () => {
    appState.markers = [{ id: 'a', position: 8000, kind: 'end' }];
    appState.positionMs = 5000;
    appState.durationMs = 10_000;
    mockIPC(() => undefined);
    handleKeydown(keyEvent('f'));
    await flush();
    expect(appState.positionMs).toBe(8000);
    expect(appState.selectedMarkerId).toBe('a');
  });
});

describe('handleKeydown — speed', () => {
  it.each([1, 2, 3, 4, 5])('key %i sets speed to SPEEDS[%i-1]', async (n) => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(keyEvent(String(n)));
    await flush();
    expect(handler).toHaveBeenCalledWith('set_speed', { speed: SPEEDS[n - 1] });
  });
});

describe('handleKeydown — edit mode', () => {
  it('[ auto-enters edit mode for the selected marker and nudges left', () => {
    appState.markers = [{ id: 'm1', position: 3000, kind: 'start' }];
    appState.selectedMarkerId = 'm1';
    appState.durationMs = 60_000;
    handleKeydown(keyEvent('['));
    expect(appState.editingMarkerId).toBe('m1');
    expect(appState.editingPositionMs).toBe(2900);
  });

  it('] auto-enters edit mode for the selected marker and nudges right', () => {
    appState.markers = [{ id: 'm1', position: 3000, kind: 'start' }];
    appState.selectedMarkerId = 'm1';
    appState.durationMs = 60_000;
    handleKeydown(keyEvent(']'));
    expect(appState.editingMarkerId).toBe('m1');
    expect(appState.editingPositionMs).toBe(3100);
  });

  it('[ nudges an already-editing marker without re-entering', () => {
    appState.markers = [{ id: 'm1', position: 3000, kind: 'start' }];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 3000;
    appState.durationMs = 60_000;
    handleKeydown(keyEvent('['));
    expect(appState.editingPositionMs).toBe(2900);
  });

  it('[ does nothing when no marker is selected and none is being edited', () => {
    appState.selectedMarkerId = null;
    appState.editingMarkerId = null;
    appState.durationMs = 60_000;
    handleKeydown(keyEvent('['));
    expect(appState.editingMarkerId).toBeNull();
  });

  it('] does nothing when no marker is selected and none is being edited', () => {
    appState.selectedMarkerId = null;
    appState.editingMarkerId = null;
    appState.durationMs = 60_000;
    handleKeydown(keyEvent(']'));
    expect(appState.editingMarkerId).toBeNull();
  });

  it('Escape cancels edit mode', () => {
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000;
    handleKeydown(keyEvent('Escape'));
    expect(appState.editingMarkerId).toBeNull();
    expect(appState.editingPositionMs).toBe(0);
  });

  it('Escape is a no-op when not in edit mode', () => {
    appState.editingMarkerId = null;
    handleKeydown(keyEvent('Escape'));
    expect(appState.editingMarkerId).toBeNull();
  });

  it('Enter confirms edit mode and invokes move_marker', async () => {
    appState.markers = [{ id: 'm1', position: 3000, kind: 'start' }];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000;
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    handleKeydown(keyEvent('Enter'));
    await flush();
    expect(handler).toHaveBeenCalledWith('move_marker', { id: 'm1', newPositionMs: 5000 });
  });

  it('Enter clears edit mode after confirming', async () => {
    appState.markers = [{ id: 'm1', position: 3000, kind: 'start' }];
    appState.editingMarkerId = 'm1';
    appState.editingPositionMs = 5000;
    mockIPC((cmd: string) => (cmd === 'validate_markers' ? [] : undefined));
    handleKeydown(keyEvent('Enter'));
    await flush();
    expect(appState.editingMarkerId).toBeNull();
  });

  it('Enter does nothing when not in edit mode', async () => {
    appState.editingMarkerId = null;
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(keyEvent('Enter'));
    await flush();
    expect(handler).not.toHaveBeenCalledWith('move_marker', expect.anything());
  });
});

describe('handleKeydown — zoom', () => {
  it('- key decrements zoom level', () => {
    appState.zoomLevel = 4;
    handleKeydown(keyEvent('-'));
    expect(appState.zoomLevel).toBe(2);
  });

  it('- key does nothing when already at minimum zoom (1)', () => {
    appState.zoomLevel = 1;
    handleKeydown(keyEvent('-'));
    expect(appState.zoomLevel).toBe(1);
  });

  it('+ key increments zoom level', () => {
    appState.zoomLevel = 2;
    handleKeydown(keyEvent('+'));
    expect(appState.zoomLevel).toBe(4);
  });

  it('= key also increments zoom level (unshifted + key)', () => {
    appState.zoomLevel = 2;
    handleKeydown(keyEvent('='));
    expect(appState.zoomLevel).toBe(4);
  });

  it('+ key does nothing when already at maximum zoom (16)', () => {
    appState.zoomLevel = 16;
    handleKeydown(keyEvent('+'));
    expect(appState.zoomLevel).toBe(16);
  });

  it('stepping through all levels with + reaches maximum', () => {
    appState.zoomLevel = 1;
    handleKeydown(keyEvent('+'));
    handleKeydown(keyEvent('+'));
    handleKeydown(keyEvent('+'));
    handleKeydown(keyEvent('+'));
    expect(appState.zoomLevel).toBe(16);
  });

  it('stepping back through all levels with - reaches minimum', () => {
    appState.zoomLevel = 16;
    handleKeydown(keyEvent('-'));
    handleKeydown(keyEvent('-'));
    handleKeydown(keyEvent('-'));
    handleKeydown(keyEvent('-'));
    expect(appState.zoomLevel).toBe(1);
  });
});

describe('handleKeydown — export', () => {
  it('Ctrl+e calls exportCsv', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(keyEvent('e', { ctrlKey: true }));
    await flush();
    expect(handler).toHaveBeenCalledWith('export_csv', expect.anything());
  });

  it('Meta+e calls exportCsv', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    handleKeydown(keyEvent('e', { metaKey: true }));
    await flush();
    expect(handler).toHaveBeenCalledWith('export_csv', expect.anything());
  });
});
