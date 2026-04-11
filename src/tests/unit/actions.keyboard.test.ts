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
    mockIPC(() => undefined);
    handleKeydown(keyEvent('d'));
    await flush();
    expect(appState.positionMs).toBe(2000);
  });

  it('f seeks to the next marker', async () => {
    appState.markers = [{ id: 'a', position: 8000, kind: 'end' }];
    appState.positionMs = 5000;
    mockIPC(() => undefined);
    handleKeydown(keyEvent('f'));
    await flush();
    expect(appState.positionMs).toBe(8000);
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
