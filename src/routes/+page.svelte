<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '$lib/state.svelte';
  import { SPEEDS } from '$lib/utils';
  import type { FileMetadata, PlaybackPosition, Marker, Segment, MarkerKind } from '$lib/types';

  import WelcomeScreen from '../components/WelcomeScreen.svelte';
  import Header from '../components/Header.svelte';
  import WaveformDisplay from '../components/WaveformDisplay.svelte';
  import PlaybackControls from '../components/PlaybackControls.svelte';
  import MarkerPanel from '../components/MarkerPanel.svelte';
  import SegmentPanel from '../components/SegmentPanel.svelte';
  import ShortcutsPanel from '../components/ShortcutsPanel.svelte';

  // ── Position polling + interpolation ─────────────────────────────────────

  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let rafHandle: number | null = null;

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      try {
        const p = await invoke<PlaybackPosition>('get_playback_position');
        appState.syncPositionMs = p.positionMs;
        appState.syncWallTime   = performance.now();
        appState.durationMs     = p.durationMs;
        appState.isPlaying      = p.isPlaying;
        // When paused, only snap if discrepancy is large (avoids glitchy snapping).
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

  function startRaf() {
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

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (!appState.metadata) return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
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
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      exportCsv();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    if (pollInterval) clearInterval(pollInterval);
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    if (appState.wavesurfer) appState.wavesurfer.destroy();
  });

  // ── Seeking ───────────────────────────────────────────────────────────────

  async function seekTo(ms: number) {
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

  async function seekToPrevMarker() {
    const prev = [...appState.markers]
      .filter(m => m.position < appState.positionMs - 50)
      .sort((a, b) => b.position - a.position)[0];
    if (prev) await seekTo(prev.position);
  }

  async function seekToNextMarker() {
    const next = appState.markers
      .filter(m => m.position > appState.positionMs + 50)
      .sort((a, b) => a.position - b.position)[0];
    if (next) await seekTo(next.position);
  }

  async function stepBack() {
    await seekTo(Math.max(appState.positionMs - appState.stepMs, 0));
  }

  async function stepFwd() {
    await seekTo(Math.min(appState.positionMs + appState.stepMs, appState.durationMs));
  }

  // ── IPC handlers ──────────────────────────────────────────────────────────

  async function openFile() {
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

  async function togglePlay() {
    try {
      appState.error = null;
      await invoke(appState.isPlaying ? 'pause' : 'play');
    } catch (e) {
      appState.error = String(e);
    }
  }

  async function setSpeed(s: number) {
    appState.speed = s;
    try {
      appState.error = null;
      await invoke('set_speed', { speed: s });
    } catch (e) {
      appState.error = String(e);
    }
  }

  async function handleLoop(enabled: boolean) {
    appState.looping = enabled;
    try {
      appState.error = null;
      await invoke('set_loop', { enabled });
    } catch (e) {
      appState.error = String(e);
    }
  }

  async function addMarker(kind: MarkerKind) {
    await addMarkerAt(kind, appState.positionMs);
  }

  async function addMarkerNoKind() {
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

  async function addMarkerAt(kind: MarkerKind, posMs: number) {
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

  async function deleteMarker(id: string) {
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

  async function renameSegment(anchorId: string) {
    try {
      appState.error = null;
      const title = appState.renameInputs[anchorId] ?? '';
      await invoke('rename_segment', { anchorId, title });
      await revalidate();
    } catch (e) {
      appState.error = String(e);
    }
  }

  function computePartialSegments(): Segment[] {
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

  async function revalidate() {
    try {
      appState.segments = await invoke<Segment[]>('validate_markers');
      appState.validationError = null;
    } catch (e) {
      appState.validationError = String(e);
      appState.segments = computePartialSegments();
    }
  }

  async function exportCsv() {
    try {
      appState.error = null;
      await invoke('export_csv');
    } catch (e) {
      appState.error = String(e);
    }
  }

  async function exportAudioSegments() {
    try {
      appState.error = null;
      await invoke('export_audio_segments');
    } catch (e) {
      appState.error = String(e);
    }
  }
</script>

{#if !appState.metadata}
  <WelcomeScreen onOpenFile={openFile} />
{:else}
  <div class="app">
    <Header onOpenFile={openFile}
            onExportAudioSegments={exportAudioSegments}
    />
    <WaveformDisplay />
    <PlaybackControls
      onStepBack={stepBack}
      onTogglePlay={togglePlay}
      onStepFwd={stepFwd}
      onSetSpeed={setSpeed}
      onToggleLoop={handleLoop}
    />
    <div class="panels">
      <MarkerPanel
        onAddMarkerNoKind={addMarkerNoKind}
        onDeleteMarker={deleteMarker}
        onAddMarkerAt={addMarkerAt}
      />
      <SegmentPanel onRenameSegment={renameSegment} />
      <ShortcutsPanel />
    </div>
  </div>
{/if}

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    background: #0d1117;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    overflow: hidden;
    height: 100vh;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .panels {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  :global(::-webkit-scrollbar) { width: 6px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: #30363d; border-radius: 3px; }
  :global(::-webkit-scrollbar-thumb:hover) { background: #4d5b6b; }
</style>
