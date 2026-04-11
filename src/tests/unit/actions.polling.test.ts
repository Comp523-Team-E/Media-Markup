import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { appState } from '$lib/state.svelte';
import { startPolling, stopPolling, startRaf, stopRaf } from '$lib/actions';
import { resetAppState } from '../helpers/reset-state';
import type { PlaybackPosition } from '$lib/types';

const playbackPos = (positionMs: number, isPlaying = true): PlaybackPosition => ({
  positionMs,
  isPlaying,
  durationMs: 60_000,
});

beforeEach(() => {
  resetAppState();
  vi.useFakeTimers();
});

afterEach(() => {
  stopPolling();
  stopRaf();
  vi.useRealTimers();
});

describe('startPolling', () => {
  it('calls get_playback_position after 100ms', async () => {
    const handler = vi.fn(() => playbackPos(1000));
    mockIPC(handler);

    startPolling();
    await vi.advanceTimersByTimeAsync(110);

    const calls = handler.mock.calls.filter(([cmd]) => cmd === 'get_playback_position');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('updates appState.isPlaying from poll result', async () => {
    mockIPC(() => playbackPos(500, true));
    startPolling();
    await vi.advanceTimersByTimeAsync(110);
    expect(appState.isPlaying).toBe(true);
  });

  it('updates appState.durationMs from poll result', async () => {
    mockIPC(() => playbackPos(500, true));
    startPolling();
    await vi.advanceTimersByTimeAsync(110);
    expect(appState.durationMs).toBe(60_000);
  });

  it('updates syncPositionMs and syncWallTime from poll result', async () => {
    mockIPC(() => playbackPos(2000));
    startPolling();
    await vi.advanceTimersByTimeAsync(110);
    expect(appState.syncPositionMs).toBe(2000);
    expect(appState.syncWallTime).toBeGreaterThan(0);
  });

  it('snaps positionMs when paused and discrepancy > 500ms', async () => {
    appState.positionMs = 0;
    mockIPC(() => ({ positionMs: 600, isPlaying: false, durationMs: 60_000 }));
    startPolling();
    await vi.advanceTimersByTimeAsync(110);
    expect(appState.positionMs).toBe(600);
  });

  it('does not snap positionMs when paused but discrepancy <= 500ms', async () => {
    appState.positionMs = 200;
    mockIPC(() => ({ positionMs: 400, isPlaying: false, durationMs: 60_000 }));
    startPolling();
    await vi.advanceTimersByTimeAsync(110);
    expect(appState.positionMs).toBe(200);
  });

  it('does not start a second interval if already polling', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    startPolling();
    startPolling();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('does not throw when invoke rejects (no file loaded)', async () => {
    mockIPC(() => { throw new Error('no file'); });
    startPolling();
    await vi.advanceTimersByTimeAsync(110);
    expect(appState.error).toBeNull();
  });
});

describe('stopPolling', () => {
  it('clears the interval', () => {
    const spy = vi.spyOn(globalThis, 'clearInterval');
    startPolling();
    stopPolling();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('stops further polling calls', async () => {
    const handler = vi.fn(() => playbackPos(0));
    mockIPC(handler);
    startPolling();
    stopPolling();
    await vi.advanceTimersByTimeAsync(500);
    const calls = handler.mock.calls.filter(([cmd]) => cmd === 'get_playback_position');
    expect(calls.length).toBe(0);
  });

  it('is safe to call when not polling', () => {
    expect(() => stopPolling()).not.toThrow();
  });
});

describe('startRaf', () => {
  it('interpolates positionMs forward when isPlaying is true', async () => {
    appState.isPlaying = true;
    appState.durationMs = 60_000;
    appState.syncPositionMs = 0;
    appState.syncWallTime = 0;
    appState.speed = 1.0;

    startRaf();
    await vi.advanceTimersByTimeAsync(200);

    expect(appState.positionMs).toBeGreaterThan(0);
  });

  it('does not interpolate when isPlaying is false', async () => {
    appState.isPlaying = false;
    appState.positionMs = 5000;
    appState.syncPositionMs = 5000;
    appState.durationMs = 60_000;
    appState.speed = 1.0;

    startRaf();
    await vi.advanceTimersByTimeAsync(200);

    expect(appState.positionMs).toBe(5000);
  });

  it('does not interpolate when waveformDragging is true', async () => {
    appState.isPlaying = true;
    appState.waveformDragging = true;
    appState.positionMs = 5000;
    appState.durationMs = 60_000;
    appState.speed = 1.0;

    startRaf();
    await vi.advanceTimersByTimeAsync(200);

    expect(appState.positionMs).toBe(5000);
  });

  it('does not start a second RAF loop if already running', () => {
    const spy = vi.spyOn(globalThis, 'requestAnimationFrame');
    startRaf();
    const callsAfterFirst = spy.mock.calls.length;
    startRaf();
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
    spy.mockRestore();
  });
});

describe('stopRaf', () => {
  it('cancels the animation frame', () => {
    const spy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    startRaf();
    stopRaf();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('is safe to call when not running', () => {
    expect(() => stopRaf()).not.toThrow();
  });
});
