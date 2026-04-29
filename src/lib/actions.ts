import { invoke } from '@tauri-apps/api/core';
import { appState } from './state.svelte';
import {
  SPEEDS,
  clampZoom,
  computeZoomedScrollLeftCentered,
  maxZoomForDuration,
  minZoomForDuration,
  zoomInLevel,
  zoomOutLevel,
} from './utils';
import { DEFAULT_SHORTCUTS, matchesShortcut } from './shortcuts';
import type { ShortcutConfig } from './shortcuts';
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

export async function loadShortcuts(): Promise<void> {
  try {
    const raw = await invoke<string | null>('read_shortcuts_config');
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ShortcutConfig>;
      appState.shortcuts = { ...DEFAULT_SHORTCUTS, ...saved };
    }
  } catch {
    // File missing or malformed — keep defaults
  }
}

export async function saveShortcuts(config: ShortcutConfig): Promise<void> {
  await invoke('write_shortcuts_config', { config: JSON.stringify(config) });
}

export function handleKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  if (!appState.metadata) return;

  const s = appState.shortcuts;

  if (appState.editingMarkerId) {
    if (matchesShortcut(e, s.cancelEdit))  { e.preventDefault(); cancelEditMode(); return; }
    if (matchesShortcut(e, s.confirmEdit)) { e.preventDefault(); confirmEditMode(); return; }
  }

  if (matchesShortcut(e, s.togglePlay)) {
    e.preventDefault(); togglePlay();
  } else if (matchesShortcut(e, s.exportCsv)) {
    e.preventDefault(); exportCsv();
  } else if (matchesShortcut(e, s.nudgeLeft)) {
    e.preventDefault(); nudgeMarker(-1);
  } else if (matchesShortcut(e, s.nudgeRight)) {
    e.preventDefault(); nudgeMarker(1);
  } else if (matchesShortcut(e, s.addStartMarker)) {
    e.preventDefault(); addMarker('start');
  } else if (matchesShortcut(e, s.addEndMarker)) {
    e.preventDefault(); addMarker('end');
  } else if (matchesShortcut(e, s.addStartEndMarker)) {
    e.preventDefault(); addMarker('startEnd');
  } else if (matchesShortcut(e, s.splitStartEndMarker) && appState.selectedMarkerId) {
    const m = appState.markers.find(mk => mk.id === appState.selectedMarkerId);
    if (m?.kind === 'startEnd') { e.preventDefault(); splitStartEndMarker(appState.selectedMarkerId); }
  } else if (matchesShortcut(e, s.deleteMarker) && appState.selectedMarkerId) {
    e.preventDefault(); deleteMarker(appState.selectedMarkerId);
  } else if (matchesShortcut(e, s.stepForward)) {
    e.preventDefault(); stepFwd();
  } else if (matchesShortcut(e, s.stepBackward)) {
    e.preventDefault(); stepBack();
  } else if (matchesShortcut(e, s.seekToEnd)) {
    e.preventDefault(); seekToEnd();
  } else if (matchesShortcut(e, s.seekToStart)) {
    e.preventDefault(); seekToStart();
  } else if (matchesShortcut(e, s.toggleFollowPlayhead)) {
    e.preventDefault(); appState.followPlayhead = !appState.followPlayhead;
  } else if (matchesShortcut(e, s.seekToPrevMarker)) {
    e.preventDefault(); seekToPrevMarker();
  } else if (matchesShortcut(e, s.seekToNextMarker)) {
    e.preventDefault(); seekToNextMarker();
  } else if (matchesShortcut(e, s.setSpeed1)) {
    e.preventDefault(); setSpeed(SPEEDS[0]);
  } else if (matchesShortcut(e, s.setSpeed2)) {
    e.preventDefault(); setSpeed(SPEEDS[1]);
  } else if (matchesShortcut(e, s.setSpeed3)) {
    e.preventDefault(); setSpeed(SPEEDS[2]);
  } else if (matchesShortcut(e, s.setSpeed4)) {
    e.preventDefault(); setSpeed(SPEEDS[3]);
  } else if (matchesShortcut(e, s.setSpeed5)) {
    e.preventDefault(); setSpeed(SPEEDS[4]);
  } else if (matchesShortcut(e, s.zoomOut)) {
    e.preventDefault();
    zoomOut();
  } else if (matchesShortcut(e, s.zoomIn)) {
    e.preventDefault();
    zoomIn();
  }
}

export function setZoomLevel(level: number): number {
  const prev = appState.zoomLevel;
  const duration = appState.durationMs;
  const minZoom = minZoomForDuration(duration);
  const maxZoom = maxZoomForDuration(duration);
  const next = Math.min(Math.max(clampZoom(level), minZoom), maxZoom);
  appState.zoomLevel = next;
  if (appState.waveformWrapEl && next !== prev) {
    const wrap = appState.waveformWrapEl;
    const previousScrollLeft = wrap.scrollLeft;
    const viewportWidth = wrap.clientWidth;
    requestAnimationFrame(() => {
      if (!appState.waveformWrapEl) return;
      appState.waveformWrapEl.scrollLeft = computeZoomedScrollLeftCentered({
        scrollLeft: previousScrollLeft,
        viewportWidth,
        prevZoom: prev,
        nextZoom: next,
      });
    });
  }
  return next;
}

export function zoomIn(step = 1): number {
  return setZoomLevel(zoomInLevel(appState.zoomLevel, appState.durationMs, step));
}

export function zoomOut(step = 1): number {
  return setZoomLevel(zoomOutLevel(appState.zoomLevel, appState.durationMs, step));
}

// ── Seeking ───────────────────────────────────────────────────────────────

export function centerWaveformAt(ms: number) {
  const wrap = appState.waveformWrapEl;
  if (!wrap || appState.zoomLevel <= 1 || appState.durationMs <= 0) return;

  const pct = ms / appState.durationMs;
  const total = wrap.scrollWidth;
  const visible = wrap.clientWidth;
  wrap.scrollLeft = Math.max(0, pct * total - visible / 2);
}

export async function seekTo(ms: number, options: { centerWaveform?: boolean } = {}) {
  try {
    await invoke('seek', { positionMs: Math.round(ms) });
    appState.positionMs     = ms;
    appState.syncPositionMs = ms;
    appState.syncWallTime   = performance.now();
    if (appState.wavesurfer && appState.durationMs > 0) {
      appState.wavesurfer.setTime(ms / 1000);
    }
    if (options.centerWaveform || appState.followPlayhead) {
      centerWaveformAt(ms);
    }
  } catch (e) {
    appState.error = String(e);
  }
}

export async function selectMarker(id: string) {
  const marker = appState.markers.find(m => m.id === id);
  if (!marker) return;
  if (appState.selectedMarkerId === appState.editingMarkerId 
    && appState.selectedMarkerId !== null) return;

  appState.selectedMarkerId = marker.id;
  await seekTo(marker.position, { centerWaveform: true });
}

export async function seekToPrevMarker() {
  const prev = [...appState.markers]
    .filter(m => m.position < appState.positionMs - 50)
    .sort((a, b) => b.position - a.position)[0];
  if (prev) {
    await selectMarker(prev.id);
  }
}

export async function seekToNextMarker() {
  const next = appState.markers
    .filter(m => m.position > appState.positionMs + 50)
    .sort((a, b) => a.position - b.position)[0];
  if (next) {
    await selectMarker(next.id);
  }
}

export async function seekToStart() {
  await seekTo(0);
}

export async function seekToEnd() {
  await seekTo(appState.durationMs);
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
    appState.successMessage = null;
    const meta = await invoke<FileMetadata>('open_file_dialog');
    appState.metadata        = meta;
    appState.durationMs      = meta.durationMs;
    appState.positionMs      = 0;
    appState.markers          = [];
    appState.segments         = null;
    appState.renameInputs     = {};
    appState.selectedMarkerId = null;
    appState.editingMarkerId  = null;
    appState.editingPositionMs = 0;
    startPolling();
    startRaf();
  } catch (e) {
    appState.error = String(e);
  }
}

export async function togglePlay() {
  try {
    appState.error = null;
    appState.successMessage = null;
    await invoke(appState.isPlaying ? 'pause' : 'play');
  } catch (e) {
    appState.error = String(e);
  }
}

export async function setSpeed(s: number) {
  appState.speed = s;
  try {
    appState.error = null;
    appState.successMessage = null;
    await invoke('set_speed', { speed: s });
  } catch (e) {
    appState.error = String(e);
  }
}

export function handleFollowPlayhead(enabled: boolean) {
  appState.followPlayhead = enabled;
}

export async function handleLoop(enabled: boolean) {
  appState.looping = enabled;
  try {
    appState.error = null;
    appState.successMessage = null;
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
    appState.successMessage = null;
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
    appState.successMessage = null;
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
    appState.successMessage = null;
    await invoke('delete_marker', { id });
    appState.markers = appState.markers.filter(m => m.id !== id);
    const updated = { ...appState.renameInputs };
    delete updated[id];
    appState.renameInputs = updated;
    if (appState.selectedMarkerId === id) appState.selectedMarkerId = null;
    if (appState.editingMarkerId === id) { appState.editingMarkerId = null; appState.editingPositionMs = 0; }
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

export async function splitStartEndMarker(id: string) {
  const marker = appState.markers.find(m => m.id === id);
  if (!marker || marker.kind !== 'startEnd') return;
  const pos = marker.position;
  const title = appState.renameInputs[id] ?? '';
  await deleteMarker(id);
  await addMarkerAt('end', pos);
  await addMarkerAt('start', pos);
  if (title && appState.selectedMarkerId) {
    appState.renameInputs = { ...appState.renameInputs, [appState.selectedMarkerId]: title };
    await revalidate();
  }
}

// ── Marker position editing ───────────────────────────────────────────────

export function enterEditMode(markerId: string) {
  const marker = appState.markers.find(m => m.id === markerId);
  if (!marker) return;
  appState.editingMarkerId   = markerId;
  appState.editingPositionMs = marker.position;
  appState.selectedMarkerId  = markerId;
}

export function cancelEditMode() {
  appState.editingMarkerId   = null;
  appState.editingPositionMs = 0;
}

export async function confirmEditMode() {
  if (!appState.editingMarkerId) return;
  const id         = appState.editingMarkerId;
  const positionMs = Math.round(appState.editingPositionMs);
  appState.editingMarkerId   = null;
  appState.editingPositionMs = 0;
  try {
    appState.error = null;
    appState.successMessage = null;
    await invoke('move_marker', { id, newPositionMs: positionMs });
    appState.markers = appState.markers
      .map(m => m.id === id ? { ...m, position: positionMs } : m)
      .sort((a, b) => a.position - b.position);
    await revalidate();
  } catch (e) {
    appState.error = String(e);
  }
}

export function moveEditingMarkerToMs(ms: number) {
  if (!appState.editingMarkerId) return;
  appState.editingPositionMs = Math.max(0, Math.min(ms, appState.durationMs));
}

export function nudgeMarker(direction: -1 | 1) {
  if (!appState.editingMarkerId) {
    if (!appState.selectedMarkerId) return;
    enterEditMode(appState.selectedMarkerId);
  }
  const newPos = appState.editingPositionMs + direction * appState.nudgeStepMs;
  appState.editingPositionMs = Math.max(0, Math.min(newPos, appState.durationMs));
}

export function computePreviewSegments(): Segment[] {
  if (!appState.editingMarkerId) return appState.segments ?? computePartialSegments();

  const previewMarkers = appState.markers
    .map(m => m.id === appState.editingMarkerId ? { ...m, position: appState.editingPositionMs } : m)
    .sort((a, b) => a.position - b.position);

  const result: Segment[] = [];
  const stack: Marker[] = [];

  for (const m of previewMarkers) {
    if (m.kind === 'start') {
      stack.push(m);
    } else if (m.kind === 'end') {
      if (stack.length > 0) {
        const start = stack.pop()!;
        result.push({ startMs: start.position, endMs: m.position,
          title: appState.renameInputs[start.id] || `Segment ${result.length}` });
      }
    } else if (m.kind === 'startEnd') {
      if (stack.length > 0) {
        const start = stack.pop()!;
        result.push({ startMs: start.position, endMs: m.position,
          title: appState.renameInputs[start.id] || `Segment ${result.length}` });
        stack.push(m);
      } else {
        result.push({ startMs: m.position, endMs: m.position,
          title: appState.renameInputs[m.id] || `Segment ${result.length}` });
      }
    }
  }
  return result;
}

export async function renameSegment(anchorId: string) {
  try {
    appState.error = null;
    appState.successMessage = null;
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
  const stack: Marker[] = [];

  for (const m of sorted) {
    if (m.kind === 'start') {
      stack.push(m);
    } else if (m.kind === 'end') {
      if (stack.length > 0) {
        const start = stack.pop()!;
        result.push({ startMs: start.position, endMs: m.position,
          title: appState.renameInputs[start.id] || `Segment ${result.length}` });
      }
    } else if (m.kind === 'startEnd') {
      if (stack.length > 0) {
        const start = stack.pop()!;
        result.push({ startMs: start.position, endMs: m.position,
          title: appState.renameInputs[start.id] || `Segment ${result.length}` });
        stack.push(m);
      } else {
        result.push({ startMs: m.position, endMs: m.position,
          title: appState.renameInputs[m.id] || `Segment ${result.length}` });
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
    appState.successMessage = null;
    await invoke('export_csv');
    appState.successMessage = 'CSV exported successfully.';
  } catch (e) {
    appState.error = String(e);
  }
}

export async function exportAudioSegments(exportCsv: boolean, exportAudio: boolean) {
  try {
    appState.error = null;
    appState.successMessage = null;
    await invoke('export_audio_segments', {exportCsv, exportAudio});
    if (exportCsv && exportAudio) appState.successMessage = 'CSV and audio segments exported successfully.';
    else if (exportCsv) appState.successMessage = 'CSV exported successfully.';
    else if (exportAudio) appState.successMessage = 'Audio segments exported successfully.';
  } catch (e) {
    appState.error = String(e);
  }
}

export async function importCsv() {
  try {
    appState.error = null;
    appState.successMessage = null;
    const markers = await invoke<Marker[]>('import_csv');
    appState.markers = markers.sort((a, b) => a.position - b.position);
    appState.renameInputs = Object.fromEntries(
      markers.filter(m => m.kind !== 'end').map(m => [m.id, ''])
    );
    appState.selectedMarkerId = null;
    appState.editingMarkerId = null;
    appState.editingPositionMs = 0;
    appState.unkindedMarkers = new Set();
    await revalidate();
  } catch (e) {
    if (String(e) !== 'Dialog cancelled') {
      appState.error = String(e);
    }
  }
}
