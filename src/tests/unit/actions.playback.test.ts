import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { appState } from '$lib/state.svelte';
import { togglePlay, setSpeed, handleLoop, openFile, exportCsv, exportAudioSegments } from '$lib/actions';
import { resetAppState } from '../helpers/reset-state';
import type { FileMetadata } from '$lib/types';

const fakeMeta: FileMetadata = {
  fileName: 'audio.mp3',
  filePath: '/path/audio.mp3',
  durationMs: 60_000,
  sampleRate: 44100,
  channels: 2,
};

beforeEach(() => {
  resetAppState();
});

describe('togglePlay', () => {
  it('calls play when paused', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    appState.isPlaying = false;
    await togglePlay();
    expect(handler).toHaveBeenCalledWith('play', expect.anything());
  });

  it('calls pause when playing', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    appState.isPlaying = true;
    await togglePlay();
    expect(handler).toHaveBeenCalledWith('pause', expect.anything());
  });

  it('sets appState.error when invoke throws', async () => {
    mockIPC(() => { throw new Error('no file loaded'); });
    await togglePlay();
    expect(appState.error).toMatch('no file loaded');
  });

  it('clears a prior error on success', async () => {
    appState.error = 'old error';
    mockIPC(() => undefined);
    await togglePlay();
    expect(appState.error).toBeNull();
  });
});

describe('setSpeed', () => {
  it('updates appState.speed immediately', async () => {
    mockIPC(() => undefined);
    await setSpeed(1.5);
    expect(appState.speed).toBe(1.5);
  });

  it('calls set_speed with the correct value', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    await setSpeed(0.75);
    expect(handler).toHaveBeenCalledWith('set_speed', { speed: 0.75 });
  });

  it('sets appState.error when invoke throws', async () => {
    // speed is updated optimistically even on failure
    mockIPC(() => { throw new Error('backend error'); });
    await setSpeed(2);
    expect(appState.error).toMatch('backend error');
    expect(appState.speed).toBe(2);
  });
});

describe('handleLoop', () => {
  it('updates appState.looping to true', async () => {
    mockIPC(() => undefined);
    await handleLoop(true);
    expect(appState.looping).toBe(true);
  });

  it('updates appState.looping to false', async () => {
    appState.looping = true;
    mockIPC(() => undefined);
    await handleLoop(false);
    expect(appState.looping).toBe(false);
  });

  it('calls set_loop with the correct value', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    await handleLoop(true);
    expect(handler).toHaveBeenCalledWith('set_loop', { enabled: true });
  });

  it('sets appState.error when invoke throws', async () => {
    mockIPC(() => { throw new Error('loop error'); });
    await handleLoop(true);
    expect(appState.error).toMatch('loop error');
  });
});

describe('openFile', () => {
  it('populates metadata from the dialog result', async () => {
    mockIPC((cmd) => cmd === 'open_file_dialog' ? fakeMeta : undefined);
    await openFile();
    expect(appState.metadata).toEqual(fakeMeta);
  });

  it('sets durationMs from metadata', async () => {
    mockIPC((cmd) => cmd === 'open_file_dialog' ? fakeMeta : undefined);
    await openFile();
    expect(appState.durationMs).toBe(60_000);
  });

  it('resets positionMs to 0', async () => {
    appState.positionMs = 30_000;
    mockIPC((cmd) => cmd === 'open_file_dialog' ? fakeMeta : undefined);
    await openFile();
    expect(appState.positionMs).toBe(0);
  });

  it('clears markers, segments, and renameInputs', async () => {
    appState.markers = [{ id: 'm1', position: 1000, kind: 'start' }];
    appState.segments = [{ startMs: 0, endMs: 1000, title: 'A' }];
    appState.renameInputs = { m1: 'foo' };
    mockIPC((cmd) => cmd === 'open_file_dialog' ? fakeMeta : undefined);
    await openFile();
    expect(appState.markers).toEqual([]);
    expect(appState.segments).toBeNull();
    expect(appState.renameInputs).toEqual({});
  });

  it('clears selectedMarkerId', async () => {
    appState.selectedMarkerId = 'm1';
    mockIPC((cmd) => cmd === 'open_file_dialog' ? fakeMeta : undefined);
    await openFile();
    expect(appState.selectedMarkerId).toBeNull();
  });

  it('sets appState.error when the dialog throws', async () => {
    mockIPC(() => { throw new Error('cancelled'); });
    await openFile();
    expect(appState.error).toMatch('cancelled');
  });
});

describe('exportCsv', () => {
  it('calls export_csv command', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    await exportCsv();
    expect(handler).toHaveBeenCalledWith('export_csv', expect.anything());
  });

  it('sets appState.error when invoke throws', async () => {
    mockIPC(() => { throw new Error('no segments'); });
    await exportCsv();
    expect(appState.error).toMatch('no segments');
  });
});

describe('exportAudioSegments', () => {
  it('calls export_audio_segments command', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    await exportAudioSegments(true, true);
    expect(handler).toHaveBeenCalledWith('export_audio_segments', { exportCsv: true, exportAudio: true });
  });

  it('sets successMessage when both exportCsv and exportAudio are true', async () => {
    mockIPC(() => undefined);
    await exportAudioSegments(true, true);
    expect(appState.successMessage).toBe('CSV and audio segments exported successfully.');
  });

  it('sets successMessage when only exportCsv is true', async () => {
    mockIPC(() => undefined);
    await exportAudioSegments(true, false);
    expect(appState.successMessage).toBe('CSV exported successfully.');
  });

  it('sets successMessage when only exportAudio is true', async () => {
    mockIPC(() => undefined);
    await exportAudioSegments(false, true);
    expect(appState.successMessage).toBe('Audio segments exported successfully.');
  });

  it('sets appState.error when invoke throws', async () => {
    mockIPC(() => { throw new Error('export failed'); });
    await exportAudioSegments(true, true);
    expect(appState.error).toMatch('export failed');
  });
});
