import { invoke } from '@tauri-apps/api/core';
import { appState } from './state.svelte';
import { SPEEDS } from './utils';
import type { FileMetadata, PlaybackPosition, Marker, Segment, MarkerKind } from './types';

// ── Position polling + interpolation ─────────────────────────────────────

export let pollInterval: ReturnType<typeof setInterval> | null = null;
export let rafHandle: number | null = null;

export function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    try {
      const p = await invoke<PlaybackPosition>('get_playback_position');
      appState.syncPositionMs = p.positionMs;
      appState.syncWallTime   = performance.now();
      appState.durationMs     = p.durationMs;
      appState.isPlaying      = p.isPlaying;
      if (!p.isPlaying && !appState.waveformDragging) {
        if (Math.abs(p.positionMs - appState.positionMs) > 500) {
          appState.positionMs = p.positionMs;
        }
      }
    } catch {
      // No file loaded
    }
  }, 100);
}

export function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export function startRaf() {
  if (rafHandle !== null) return;
  function tick() {
    if (appState.isPlaying && !appState.waveformDragging) {
      const elapsed = performance.now() - appState.syncWallTime;
      appState.positionMs = Math.min(appState.syncPositionMs + elapsed * appState.speed, appState.durationMs);
      if (appState.wavesurfer && appState.durationMs > 0) {
        appState.wavesurfer.setTime(appState.positionMs / 1000);
      }
    }
    rafHandle = requestAnimationFrame(tick);
  }
  rafHandle = requestAnimationFrame(tick);
}

export function stopRaf() {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────

export function handleKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  if (!appState.metadata) return;

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    exportCsv();
  } else if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    addMarker('start');
  } else if (e.key === 'e' || e.key === 'E') {
    e.preventDefault();
    addMarker('end');
  } else if (e.key === 'b' || e.key === 'B') {
    e.preventDefault();
    addMarker('startEnd');
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (appState.selectedMarkerId) {
      e.preventDefault();
      deleteMarker(appState.selectedMarkerId);
    }
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    stepFwd();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    stepBack();
  } else if (e.key === 'd' || e.key === 'D') {
    e.preventDefault();
    seekToPrevMarker();
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    seekToNextMarker();
  } else if (e.key >= '1' && e.key <= '5') {
    e.preventDefault();
    const idx = parseInt(e.key) - 1;
    if (SPEEDS[idx] !== undefined) setSpeed(SPEEDS[idx]);
  }
}

// ── Seeking ───────────────────────────────────────────────────────────────

export async function seekTo(ms: number) {
  try {
    await invoke('seek', { positionMs: Math.round(ms) });
    appState.positionMs     = ms;
    appState.syncPositionMs = ms;
    appState.syncWallTime   = performance.now();
    if (appState.wavesurfer && appState.durationMs > 0) {
      appState.wavesurfer.setTime(ms / 1000);
    }
  } catch (e) {
    appState.error = String(e);
  }
}

export async function seekToPrevMarker() {
  const prev = [...appState.markers]
    .filter(m => m.position < appState.positionMs - 50)
    .sort((a, b) => b.position - a.position)[0];
  if (prev) await seekTo(prev.position);
}

export async function seekToNextMarker() {
  const next = appState.markers
    .filter(m => m.position > appState.positionMs + 50)
    .sort((a, b) => a.position - b.position)[0];
  if (next) await seekTo(next.position);
}

export async function stepBack() {
  await seekTo(Math.max(appState.positionMs - appState.stepMs, 0));
}

export async function stepFwd() {
  await seekTo(Math.min(appState.positionMs + appState.stepMs, appState.durationMs));
}

// ── IPC handlers ──────────────────────────────────────────────────────────

export async function openFile() {
  try {
    appState.error = null;
    const meta = await invoke<FileMetadata>('open_file_dialog');
    appState.metadata        = meta;
    appState.durationMs      = meta.durationMs;
    appState.positionMs      = 0;
    appState.markers         = [];
    appState.segments        = null;
    appState.renameInputs    = {};
    appState.selectedMarkerId = null;
    startPolling();
    startRaf();
  } catch (e) {
    appState.error = String(e);
  }
}

export async function togglePlay() {
  try {
    appState.error = null;
    await invoke(appState.isPlaying ? 'pause' : 'play');
  } catch (e) {
    appState.error = String(e);
  }
}

export async function setSpeed(s: number) {
  appState.speed = s;
  try {
    appState.error = null;
    await invoke('set_speed', { speed: s });
  } catch (e) {
    appState.error = String(e);
  }
}

export async function handleLoop(enabled: boolean) {
  appState.looping = enabled;
  try {
    appState.error = null;
    await invoke('set_loop', { enabled });
  } catch (e) {
    appState.error = String(e);
  }
}

export async function addMarker(kind: MarkerKind) {
  await addMarkerAt(kind, appState.positionMs);
}

export async function addMarkerNoKind() {
  try {
    appState.error = null;
    const m = await invoke<Marker>('add_marker', {
      positionMs: Math.round(appState.positionMs),
      kind: 'start',
    });
    appState.markers = [...appState.markers, m].sort((a, b) => a.position - b.position);
    appState.renameInputs = { ...appState.renameInputs, [m.id]: '' };
    appState.selectedMarkerId = m.id;
    appState.unkindedMarkers = new Set([...appState.unkindedMarkers, m.id]);
    await revalidate();
  } catch (e) {
    appState.error = String(e);
  }
}

export async function addMarkerAt(kind: MarkerKind, posMs: number) {
  try {
    appState.error = null;
    const m = await invoke<Marker>('add_marker', {
      positionMs: Math.round(posMs),
      kind,
    });
    appState.markers = [...appState.markers, m].sort((a, b) => a.position - b.position);
    if (kind !== 'end') {
      appState.renameInputs = { ...appState.renameInputs, [m.id]: '' };
    }
    appState.selectedMarkerId = m.id;
    await revalidate();
  } catch (e) {
    appState.error = String(e);
  }
}

export async function deleteMarker(id: string) {
  try {
    appState.error = null;
    await invoke('delete_marker', { id });
    appState.markers = appState.markers.filter(m => m.id !== id);
    const updated = { ...appState.renameInputs };
    delete updated[id];
    appState.renameInputs = updated;
    if (appState.selectedMarkerId === id) appState.selectedMarkerId = null;
    if (appState.unkindedMarkers.has(id)) {
      const s = new Set(appState.unkindedMarkers);
      s.delete(id);
      appState.unkindedMarkers = s;
    }
    await revalidate();
  } catch (e) {
    appState.error = String(e);
  }
}

export async function renameSegment(anchorId: string) {
  try {
    appState.error = null;
    const title = appState.renameInputs[anchorId] ?? '';
    await invoke('rename_segment', { anchorId, title });
    await revalidate();
  } catch (e) {
    appState.error = String(e);
  }
}

export function computePartialSegments(): Segment[] {
  const sorted = [...appState.markers].sort((a, b) => a.position - b.position);
  const result: Segment[] = [];
  let pendingStart: Marker | null = null;

  for (const m of sorted) {
    if (m.kind === 'startEnd') {
      if (pendingStart) {
        result.push({ startMs: pendingStart.position, endMs: m.position,
          title: appState.renameInputs[pendingStart.id] || `Segment ${result.length}` });
        pendingStart = m;
      } else {
        result.push({ startMs: m.position, endMs: m.position,
          title: appState.renameInputs[m.id] || `Segment ${result.length}` });
      }
    } else if (m.kind === 'start') {
      pendingStart = m;
    } else if (m.kind === 'end') {
      if (pendingStart) {
        result.push({ startMs: pendingStart.position, endMs: m.position,
          title: appState.renameInputs[pendingStart.id] || `Segment ${result.length}` });
        pendingStart = null;
      }
    }
  }
  return result;
}

export async function revalidate() {
  try {
    appState.segments = await invoke<Segment[]>('validate_markers');
    appState.validationError = null;
  } catch (e) {
    appState.validationError = String(e);
    appState.segments = computePartialSegments();
  }
}

export async function exportCsv() {
  try {
    appState.error = null;
    await invoke('export_csv');
  } catch (e) {
    appState.error = String(e);
  }
}

export async function exportAudioSegments() {
  try {
    appState.error = null;
    await invoke('export_audio_segments');
  } catch (e) {
    appState.error = String(e);
  }
}
