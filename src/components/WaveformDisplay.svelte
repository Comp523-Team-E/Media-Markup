<script lang="ts">
  import { invoke, convertFileSrc } from '@tauri-apps/api/core';
  import WaveSurfer from 'wavesurfer.js';
  import { appState } from '$lib/state.svelte';
  import { kindLabel, formatMs, ZOOM_LEVELS } from '$lib/utils';
  import { validationProblemMarkerIds } from '$lib/validation';
  import { moveEditingMarkerToMs } from '$lib/actions';

  let waveformEl     = $state<HTMLDivElement | null>(null);
  let waveformWrapEl = $state<HTMLDivElement | null>(null);
  const validationProblemIds = $derived(validationProblemMarkerIds(appState.markers, appState.validationError));

  // Expose the wrap element so external code can scroll it if needed
  $effect(() => { appState.waveformWrapEl = waveformWrapEl; });

  // Initialize (or reinitialize) WaveSurfer whenever the loaded file changes.
  // The cleanup function runs on component destroy or before re-running.
  $effect(() => {
    const filePath = appState.metadata?.filePath;
    if (!filePath || !waveformEl) return;

    // Reset zoom and scroll when a new file is loaded
    appState.zoomLevel = 1;
    if (waveformWrapEl) waveformWrapEl.scrollLeft = 0;

    const ws = WaveSurfer.create({
      container: waveformEl,
      waveColor: '#1d4ed8',
      progressColor: '#3b82f6',
      cursorColor: '#ffffff',
      cursorWidth: 2,
      height: waveformWrapEl?.clientHeight || 180,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: false, // pointer events handled manually for real-time drag
    });
    ws.load(convertFileSrc(filePath));
    appState.wavesurfer = ws;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const height = Math.round(entry.contentRect.height);
      if (height > 0) ws.setOptions({ height });
    });
    if (waveformWrapEl) resizeObserver.observe(waveformWrapEl);

    return () => {
      resizeObserver.disconnect();
      ws.destroy();
      appState.wavesurfer = null;
    };
  });

  // Auto-scroll to keep playhead centered during playback
  $effect(() => {
    const pos = appState.positionMs; // reactive dependency
    if (!waveformWrapEl || appState.waveformDragging || appState.zoomLevel <= 1) return;
    if (!appState.followPlayhead) return;
    const pct = appState.durationMs > 0 ? pos / appState.durationMs : 0;
    const total = waveformWrapEl.scrollWidth;
    const visible = waveformWrapEl.clientWidth;
    waveformWrapEl.scrollLeft = Math.max(0, pct * total - visible / 2);
  });

  // ── Zoom controls ──────────────────────────────────────────────────────

  function zoomIn() {
    const i = ZOOM_LEVELS.indexOf(appState.zoomLevel);
    if (i < ZOOM_LEVELS.length - 1) appState.zoomLevel = ZOOM_LEVELS[i + 1];
  }

  function zoomOut() {
    const i = ZOOM_LEVELS.indexOf(appState.zoomLevel);
    if (i > 0) appState.zoomLevel = ZOOM_LEVELS[i - 1];
  }

  // ── Waveform drag seeking ──────────────────────────────────────────────
  // We own pointer events on the container so the playhead moves in real-time.
  //
  // editDragging tracks a pointer-down that started while a marker was being
  // edited.  It is intentionally separate from appState.waveformDragging so
  // that confirmEditMode() (triggered by Enter) cannot clear it: if the user
  // presses Enter while still holding the mouse, the subsequent pointer-up must
  // still be handled as an edit drag — not fall through to the seek path and
  // snap the playhead to the mouse position.

  let waveformWasPlaying = false;
  let editDragging = false;

  function waveformPosFromEvent(e: PointerEvent): number {
    if (!waveformEl) return 0;
    // getBoundingClientRect returns screen coords accounting for scroll offset,
    // so this calculation is correct even when the waveform is zoomed and scrolled.
    const rect = waveformEl.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return pct * appState.durationMs;
  }

  function handlePointerDown(e: PointerEvent) {
    if (!appState.metadata || appState.durationMs === 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ms = waveformPosFromEvent(e);
    if (appState.editingMarkerId) {
      editDragging = true;
      appState.waveformDragging = true;
      moveEditingMarkerToMs(ms);
      return;
    }
    appState.waveformDragging = true;
    waveformWasPlaying = appState.isPlaying;
    if (appState.isPlaying) {
      appState.isPlaying = false;
      invoke('pause').catch(() => {});
    }
    appState.positionMs = ms;
    if (appState.wavesurfer) appState.wavesurfer.setTime(ms / 1000);
  }

  function handlePointerMove(e: PointerEvent) {
    const ms = waveformPosFromEvent(e);
    if (editDragging) {
      moveEditingMarkerToMs(ms);
      return;
    }
    if (!appState.waveformDragging) return;
    appState.positionMs = ms;
    if (appState.wavesurfer) appState.wavesurfer.setTime(ms / 1000);
  }

  async function handlePointerUp(e: PointerEvent) {
    const ms = waveformPosFromEvent(e);
    if (editDragging) {
      editDragging = false;
      appState.waveformDragging = false;
      moveEditingMarkerToMs(ms);
      return;
    }
    if (!appState.waveformDragging) return;
    appState.waveformDragging = false;
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

<div class="zoom-controls">
  <button
    class="zoom-btn"
    onclick={zoomOut}
    disabled={!appState.metadata || appState.zoomLevel <= 1}
    title="Zoom out"
  >−</button>
  <span class="zoom-label">{appState.zoomLevel}x</span>
  <button
    class="zoom-btn"
    onclick={zoomIn}
    disabled={!appState.metadata || appState.zoomLevel >= 16}
    title="Zoom in"
  >+</button>
</div>

<div
  class="waveform-wrap"
  class:waveform-editing={!!appState.editingMarkerId}
  bind:this={waveformWrapEl}
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
  {#if appState.editingMarkerId}
    <div class="edit-mode-hint">Click to move marker · Enter to confirm · Esc to cancel</div>
  {/if}
  <div class="waveform-scroll" style="width: {appState.zoomLevel * 100}%">
    <div class="waveform-inner" bind:this={waveformEl}></div>
    <!-- Marker overlays — left: pct% is relative to waveform-scroll, same width as the waveform -->
    {#each appState.markers as m (m.id)}
      {@const isEditing = appState.editingMarkerId === m.id}
      {@const draftPct  = appState.durationMs > 0 ? (appState.editingPositionMs / appState.durationMs) * 100 : 0}
      {@const origPct   = appState.durationMs > 0 ? (m.position / appState.durationMs) * 100 : 0}
      {#if isEditing}
        <!-- Ghost at original position -->
        <div
          class="marker-line marker-ghost"
          class:marker-validation-error={validationProblemIds.has(m.id)}
          style="left: {origPct}%"
          title="Original — {formatMs(m.position)}"
        ></div>
        <!-- Draft at new position -->
        <div
          class="marker-line marker-editing"
          class:marker-validation-error={validationProblemIds.has(m.id)}
          style="left: {draftPct}%"
          title="{kindLabel(m.kind)} — {formatMs(appState.editingPositionMs)}"
        ></div>
      {:else}
        <div
          class="marker-line"
          class:marker-start={m.kind === 'start'}
          class:marker-end={m.kind === 'end'}
          class:marker-both={m.kind === 'startEnd'}
          class:marker-selected={appState.selectedMarkerId === m.id}
          class:marker-validation-error={validationProblemIds.has(m.id)}
          style="left: {origPct}%"
          title="{kindLabel(m.kind)} — {formatMs(m.position)}"
        ></div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    background: #0f1419;
    border-bottom: 1px solid #21262d;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: #1e2a3a;
    border: 1px solid #30363d;
    border-radius: 5px;
    color: #8b949e;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .zoom-btn:hover:not(:disabled) { color: #e2e8f0; border-color: #4d6a8a; }
  .zoom-btn:disabled { opacity: 0.35; cursor: default; }

  .zoom-label {
    font-size: 11px;
    color: #8b949e;
    min-width: 28px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .waveform-wrap {
    position: relative;
    width: 100%;
    height: clamp(120px, 24vh, 180px);
    flex-shrink: 0;
    background: #0d1117;
    border-bottom: 1px solid #21262d;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .waveform-wrap.waveform-editing {
    cursor: crosshair;
    outline: 2px solid #f97316;
    outline-offset: -2px;
  }

  .edit-mode-hint {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    background: rgba(249, 115, 22, 0.85);
    color: #fff;
    font-size: 11px;
    padding: 2px 10px;
    border-radius: 4px;
    pointer-events: none;
    white-space: nowrap;
    user-select: none;
  }

  .waveform-scroll {
    position: relative;
    height: 100%;
    min-width: 100%;
  }

  .waveform-inner {
    width: 100%;
    height: 100%;
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

  .marker-line.marker-start {
    background: #22c55e;
  }

  .marker-line.marker-end {
    background: #f87171;
  }

  .marker-line.marker-both {
    background: linear-gradient(to bottom, #22c55e 0 50%, #f87171 50% 100%);
  }

  .marker-line.marker-selected {
    opacity: 1;
  }

  .marker-line.marker-ghost {
    background: #f97316;
    opacity: 0.3;
  }

  .marker-line.marker-editing {
    background: #f97316;
    opacity: 1;
    animation: editing-pulse 1s ease-in-out infinite alternate;
  }

  .marker-line.marker-validation-error {
    background: #f87171;
    opacity: 1;
    width: 3px;
    box-shadow: 0 0 8px rgba(248, 113, 113, 0.85);
  }

  @keyframes editing-pulse {
    from { opacity: 0.6; }
    to   { opacity: 1; }
  }
</style>
