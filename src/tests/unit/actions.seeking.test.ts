import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { appState } from '$lib/state.svelte';
import { seekTo, seekToPrevMarker, seekToNextMarker, stepBack, stepFwd } from '$lib/actions';
import { resetAppState } from '../helpers/reset-state';
import type { Marker } from '$lib/types';

function marker(id: string, position: number, kind: Marker['kind'] = 'start'): Marker {
  return { id, position, kind };
}

beforeEach(() => {
  resetAppState();
});

describe('seekTo', () => {
  it('updates positionMs and syncPositionMs on success', async () => {
    mockIPC(() => undefined);
    await seekTo(2500);
    expect(appState.positionMs).toBe(2500);
    expect(appState.syncPositionMs).toBe(2500);
  });

  it('sends the rounded position to invoke', async () => {
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    await seekTo(2500.7);
    expect(handler).toHaveBeenCalledWith('seek', { positionMs: 2501 });
  });

  it('stores the unrounded value in state', async () => {
    mockIPC(() => undefined);
    await seekTo(2500.7);
    expect(appState.positionMs).toBe(2500.7);
  });

  it('sets appState.error when invoke throws', async () => {
    mockIPC(() => { throw new Error('seek failed'); });
    await seekTo(100);
    expect(appState.error).toBe('Error: seek failed');
  });

  it('does not update positionMs when invoke throws', async () => {
    appState.positionMs = 1000;
    mockIPC(() => { throw new Error('oops'); });
    await seekTo(5000);
    expect(appState.positionMs).toBe(1000);
  });
});

describe('seekToPrevMarker', () => {
  it('does nothing when there are no markers before current position', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 5000)];
    appState.positionMs = 1000;
    await seekToPrevMarker();
    expect(appState.positionMs).toBe(1000);
  });

  it('seeks to the closest preceding marker', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 1000), marker('b', 3000), marker('c', 7000)];
    appState.positionMs = 5000;
    await seekToPrevMarker();
    expect(appState.positionMs).toBe(3000);
  });

  it('ignores markers within 50ms of current position (deadband)', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 4990)];
    appState.positionMs = 5000;
    await seekToPrevMarker();
    expect(appState.positionMs).toBe(5000);
  });

  it('seeks to marker exactly 51ms before current position', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 4949)];
    appState.positionMs = 5000;
    await seekToPrevMarker();
    expect(appState.positionMs).toBe(4949);
  });

  it('sets selectedMarkerId to the marker seeked to', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 1000), marker('b', 3000)];
    appState.positionMs = 5000;
    await seekToPrevMarker();
    expect(appState.selectedMarkerId).toBe('b');
  });

  it('does not change selectedMarkerId when no previous marker exists', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 8000)];
    appState.positionMs = 1000;
    appState.selectedMarkerId = null;
    await seekToPrevMarker();
    expect(appState.selectedMarkerId).toBeNull();
  });
});

describe('seekToNextMarker', () => {
  it('does nothing when there are no markers after current position', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 1000)];
    appState.positionMs = 5000;
    await seekToNextMarker();
    expect(appState.positionMs).toBe(5000);
  });

  it('seeks to the closest following marker', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 1000), marker('b', 7000), marker('c', 9000)];
    appState.positionMs = 5000;
    await seekToNextMarker();
    expect(appState.positionMs).toBe(7000);
  });

  it('ignores markers within 50ms of current position (deadband)', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 5010)];
    appState.positionMs = 5000;
    await seekToNextMarker();
    expect(appState.positionMs).toBe(5000);
  });

  it('sets selectedMarkerId to the marker seeked to', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 7000), marker('b', 9000)];
    appState.positionMs = 5000;
    await seekToNextMarker();
    expect(appState.selectedMarkerId).toBe('a');
  });

  it('does not change selectedMarkerId when no next marker exists', async () => {
    mockIPC(() => undefined);
    appState.markers = [marker('a', 1000)];
    appState.positionMs = 5000;
    appState.selectedMarkerId = null;
    await seekToNextMarker();
    expect(appState.selectedMarkerId).toBeNull();
  });
});

describe('stepBack', () => {
  it('decrements positionMs by stepMs', async () => {
    mockIPC(() => undefined);
    appState.positionMs = 10_000;
    appState.stepMs = 5000;
    appState.durationMs = 60_000;
    await stepBack();
    expect(appState.positionMs).toBe(5000);
  });

  it('clamps to 0 when step would go negative', async () => {
    mockIPC(() => undefined);
    appState.positionMs = 3000;
    appState.stepMs = 5000;
    appState.durationMs = 60_000;
    await stepBack();
    expect(appState.positionMs).toBe(0);
  });
});

describe('stepFwd', () => {
  it('increments positionMs by stepMs', async () => {
    mockIPC(() => undefined);
    appState.positionMs = 10_000;
    appState.stepMs = 5000;
    appState.durationMs = 60_000;
    await stepFwd();
    expect(appState.positionMs).toBe(15_000);
  });

  it('clamps to durationMs when step would exceed it', async () => {
    mockIPC(() => undefined);
    appState.positionMs = 58_000;
    appState.stepMs = 5000;
    appState.durationMs = 60_000;
    await stepFwd();
    expect(appState.positionMs).toBe(60_000);
  });
});
