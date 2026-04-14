<script lang="ts">
  import { invoke, convertFileSrc } from '@tauri-apps/api/core';
  import WaveSurfer from 'wavesurfer.js';
  import { appState } from '$lib/state.svelte';
  import { kindLabel, formatMs } from '$lib/utils';

  let waveformEl = $state<HTMLDivElement | null>(null);

  // Initialize (or reinitialize) WaveSurfer whenever the loaded file changes.
  // The cleanup function runs on component destroy or before re-running.
  $effect(() => {
    const filePath = appState.metadata?.filePath;
    if (!filePath || !waveformEl) return;

    const ws = WaveSurfer.create({
      container: waveformEl,
      waveColor: '#1d4ed8',
      progressColor: '#3b82f6',
      cursorColor: '#ffffff',
      cursorWidth: 2,
      height: 180,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: false, // pointer events handled manually for real-time drag
    });
    ws.load(convertFileSrc(filePath));
    appState.wavesurfer = ws;

    return () => {
      ws.destroy();
      appState.wavesurfer = null;
    };
  });

  // ── Waveform drag seeking ──────────────────────────────────────────────
  // We own pointer events on the container so the playhead moves in real-time.

  let waveformWasPlaying = false;

  function waveformPosFromEvent(e: PointerEvent): number {
    if (!waveformEl) return 0;
    const rect = waveformEl.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return pct * appState.durationMs;
  }

  function handlePointerDown(e: PointerEvent) {
    if (!appState.metadata || appState.durationMs === 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    appState.waveformDragging = true;
    waveformWasPlaying = appState.isPlaying;
    if (appState.isPlaying) {
      appState.isPlaying = false;
      invoke('pause').catch(() => {});
    }
    const ms = waveformPosFromEvent(e);
    appState.positionMs = ms;
    if (appState.wavesurfer) appState.wavesurfer.setTime(ms / 1000);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!appState.waveformDragging) return;
    const ms = waveformPosFromEvent(e);
    appState.positionMs = ms;
    if (appState.wavesurfer) appState.wavesurfer.setTime(ms / 1000);
  }

  async function handlePointerUp(e: PointerEvent) {
    if (!appState.waveformDragging) return;
    appState.waveformDragging = false;
    const ms = waveformPosFromEvent(e);
    appState.positionMs    = ms;
    appState.syncPositionMs = ms;
    appState.syncWallTime   = performance.now();
    if (appState.wavesurfer) appState.wavesurfer.setTime(ms / 1000);
    try {
      await invoke('seek', { positionMs: Math.round(ms) });
      if (waveformWasPlaying) {
        await invoke('play');
        appState.isPlaying = true;
      }
    } catch (err) {
      appState.error = String(err);
    }
  }
</script>

<div
  class="waveform-wrap"
  role="slider"
  aria-label="Playback position"
  aria-valuemin={0}
  aria-valuemax={appState.durationMs}
  aria-valuenow={appState.positionMs}
  tabindex="0"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
>
  <div class="waveform-inner" bind:this={waveformEl}></div>
  <!-- Marker overlays -->
  {#each appState.markers as m (m.id)}
    {@const isEditing = appState.editingMarkerId === m.id}
    {@const draftPct  = appState.durationMs > 0 ? (appState.editingPositionMs / appState.durationMs) * 100 : 0}
    {@const origPct   = appState.durationMs > 0 ? (m.position / appState.durationMs) * 100 : 0}
    {#if isEditing}
      <!-- Ghost at original position -->
      <div
        class="marker-line marker-ghost"
        style="left: {origPct}%"
        title="Original — {formatMs(m.position)}"
      ></div>
      <!-- Draft at new position -->
      <div
        class="marker-line marker-editing"
        style="left: {draftPct}%"
        title="{kindLabel(m.kind)} — {formatMs(appState.editingPositionMs)}"
      ></div>
    {:else}
      <div
        class="marker-line"
        class:marker-selected={appState.selectedMarkerId === m.id}
        style="left: {origPct}%"
        title="{kindLabel(m.kind)} — {formatMs(m.position)}"
      ></div>
    {/if}
  {/each}
</div>

<style>
  .waveform-wrap {
    position: relative;
    width: 100%;
    height: 180px;
    flex-shrink: 0;
    background: #0d1117;
    border-bottom: 1px solid #21262d;
    overflow: hidden;
  }

  .waveform-inner {
    width: 100%;
  }

  .marker-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #22c55e;
    pointer-events: none;
    transform: translateX(-50%);
    opacity: 0.9;
    z-index: 10;
    transition: opacity 0.1s;
  }

  .marker-line.marker-selected {
    background: #facc15;
    opacity: 1;
    width: 2px;
    box-shadow: 0 0 6px #facc15;
  }

  .marker-line.marker-ghost {
    background: #22c55e;
    opacity: 0.3;
  }

  .marker-line.marker-editing {
    background: #f97316;
    opacity: 1;
    box-shadow: 0 0 8px #f97316;
    animation: editing-pulse 1s ease-in-out infinite alternate;
  }

  @keyframes editing-pulse {
    from { opacity: 0.6; }
    to   { opacity: 1; }
  }
</style>
