<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onDestroy } from 'svelte';

  // ── Types ────────────────────────────────────────────────────────────────

  interface FileMetadata {
    fileName: string;
    durationMs: number;
    sampleRate: number;
    channels: number;
  }

  interface PlaybackPosition {
    positionMs: number;
    isPlaying: boolean;
    durationMs: number;
  }

  type MarkerKind = 'start' | 'end' | 'startEnd';

  interface Marker {
    id: string;
    position: number;
    kind: MarkerKind;
  }

  interface Segment {
    startMs: number;
    endMs: number;
    title: string;
  }

  // ── State ────────────────────────────────────────────────────────────────

  let metadata     = $state<FileMetadata | null>(null);
  let positionMs   = $state(0);
  let durationMs   = $state(0);
  let isPlaying    = $state(false);
  let isSeeking    = $state(false);
  let markers      = $state<Marker[]>([]);
  let segments     = $state<Segment[] | null>(null);
  let error        = $state<string | null>(null);
  let stepMs       = $state(5000);
  let speed        = $state(1.0);
  let looping      = $state(false);
  let renameInputs = $state<Record<string, string>>({});

  // ── Helpers ──────────────────────────────────────────────────────────────

  function formatMs(ms: number): string {
    const h   = Math.floor(ms / 3_600_000);
    const m   = Math.floor((ms % 3_600_000) / 60_000);
    const s   = Math.floor((ms % 60_000) / 1000);
    const mil = Math.floor(ms % 1000);
    return (
      String(h).padStart(2, '0') + ':' +
      String(m).padStart(2, '0') + ':' +
      String(s).padStart(2, '0') + '.' +
      String(mil).padStart(3, '0')
    );
  }

  function kindLabel(kind: MarkerKind): string {
    if (kind === 'start') return 'Start';
    if (kind === 'end')   return 'End';
    return 'Start+End';
  }

  // ── Position polling + interpolation ────────────────────────────────────
  //
  // Strategy: poll the backend every 100 ms for a ground-truth position, then
  // use requestAnimationFrame (~60 fps) to advance positionMs with the wall
  // clock between syncs. This eliminates both the 100 ms poll stutter and the
  // per-FLAC-packet jump (~93 ms at 44100 Hz / 4096 samples).

  /** Last position received from the backend (ms). */
  let syncPositionMs = 0;
  /** performance.now() value at the moment syncPositionMs was recorded. */
  let syncWallTime   = 0;

  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let rafHandle: number | null = null;

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      try {
        const p = await invoke<PlaybackPosition>('get_playback_position');
        // Anchor the interpolation to the fresh backend value.
        syncPositionMs = p.positionMs;
        syncWallTime   = performance.now();
        durationMs     = p.durationMs;
        isPlaying      = p.isPlaying;
        // When paused (and not seeking), snap immediately to the backend value.
        // Never overwrite positionMs while the user is dragging — that's what
        // causes the slider to jump back to the playback head mid-drag.
        if (!p.isPlaying && !isSeeking) {
          positionMs = p.positionMs;
        }
      } catch {
        // No file loaded — ignore
      }
    }, 100);
  }

  function startRaf() {
    if (rafHandle !== null) return;
    function tick() {
      if (isPlaying && !isSeeking) {
        const elapsed = performance.now() - syncWallTime;
        positionMs = Math.min(syncPositionMs + elapsed * speed, durationMs);
      }
      rafHandle = requestAnimationFrame(tick);
    }
    rafHandle = requestAnimationFrame(tick);
  }

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
  });

  // ── IPC handlers ─────────────────────────────────────────────────────────

  async function openFile() {
    try {
      error = null;
      metadata     = await invoke<FileMetadata>('open_file_dialog');
      durationMs   = metadata.durationMs;
      positionMs   = 0;
      markers      = [];
      segments     = null;
      renameInputs = {};
      startPolling();
      startRaf();
    } catch (e) {
      error = String(e);
    }
  }

  async function togglePlay() {
    try {
      error = null;
      await invoke(isPlaying ? 'pause' : 'play');
    } catch (e) {
      error = String(e);
    }
  }

  // Track whether audio was playing when the drag began so we can resume it.
  let wasPlayingBeforeSeek = false;

  function handleSeekStart() {
    isSeeking = true;
    wasPlayingBeforeSeek = isPlaying;
    if (isPlaying) {
      isPlaying = false;                      // optimistic UI update
      invoke('pause').catch(() => {});        // tell the backend; don't await
    }
  }

  async function handleSeekEnd(e: Event) {
    const ms = Number((e.currentTarget as HTMLInputElement).value);
    positionMs = ms;
    try {
      error = null;
      await invoke('seek', { positionMs: Math.round(ms) });
      // Re-anchor interpolation so the RAF loop starts from the new position.
      syncPositionMs = ms;
      syncWallTime   = performance.now();
      // Resume playback if it was playing before the drag.
      if (wasPlayingBeforeSeek) {
        await invoke('play');
        isPlaying = true;
      }
    } catch (err) {
      error = String(err);
    } finally {
      isSeeking = false;
    }
  }

  async function stepBack() {
    try {
      error = null;
      await invoke('step_backward', { stepMs: Math.round(stepMs) });
    } catch (e) {
      error = String(e);
    }
  }

  async function stepFwd() {
    try {
      error = null;
      await invoke('step_forward', { stepMs: Math.round(stepMs) });
    } catch (e) {
      error = String(e);
    }
  }

  async function handleSpeed(e: Event) {
    speed = Number((e.currentTarget as HTMLSelectElement).value);
    try {
      error = null;
      await invoke('set_speed', { speed });
    } catch (err) {
      error = String(err);
    }
  }

  async function handleLoop(e: Event) {
    looping = (e.currentTarget as HTMLInputElement).checked;
    try {
      error = null;
      await invoke('set_loop', { enabled: looping });
    } catch (err) {
      error = String(err);
    }
  }

  async function addMarker(kind: MarkerKind) {
    try {
      error = null;
      const m = await invoke<Marker>('add_marker', {
        positionMs: Math.round(positionMs),
        kind,
      });
      markers = [...markers, m].sort((a, b) => a.position - b.position);
      if (kind !== 'end') {
        renameInputs = { ...renameInputs, [m.id]: '' };
      }
    } catch (e) {
      error = String(e);
    }
  }

  async function deleteMarker(id: string) {
    try {
      error = null;
      await invoke('delete_marker', { id });
      markers = markers.filter(m => m.id !== id);
      const updated = { ...renameInputs };
      delete updated[id];
      renameInputs = updated;
    } catch (e) {
      error = String(e);
    }
  }

  async function renameSegment(anchorId: string) {
    try {
      error = null;
      const title = renameInputs[anchorId] ?? '';
      await invoke('rename_segment', { anchorId, title });
    } catch (e) {
      error = String(e);
    }
  }

  async function validate() {
    try {
      error = null;
      segments = await invoke<Segment[]>('validate_markers');
    } catch (e) {
      error = String(e);
      segments = null;
    }
  }

  async function exportCsv() {
    try {
      error = null;
      await invoke('export_csv');
    } catch (e) {
      error = String(e);
    }
  }
</script>

<main>
  <h1>Media Markup</h1>

  <!-- ── File open ─────────────────────────────────────────── -->
  <section>
    <button onclick={openFile}>Open File…</button>
    {#if error}
      <p><strong>Error:</strong> {error}</p>
    {/if}
  </section>

  {#if metadata}

  <!-- ── File info ─────────────────────────────────────────── -->
  <section>
    <h2>File</h2>
    <p>
      <strong>{metadata.fileName}</strong> —
      Duration: {formatMs(durationMs)} —
      {metadata.sampleRate} Hz —
      {metadata.channels} ch
    </p>
  </section>

  <!-- ── Playback ──────────────────────────────────────────── -->
  <section>
    <h2>Playback</h2>

    <p>
      <strong>{formatMs(positionMs)}</strong> / {formatMs(durationMs)}
      &nbsp;
      {isPlaying ? '▶ Playing' : '⏸ Paused'}
    </p>

    <input
      type="range"
      min="0"
      max={durationMs}
      value={positionMs}
      onmousedown={handleSeekStart}
      ontouchstart={handleSeekStart}
      oninput={(e) => { positionMs = Number((e.currentTarget as HTMLInputElement).value); }}
      onchange={handleSeekEnd}
      style="width: 100%"
    />

    <br><br>

    <button onclick={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
    &nbsp;
    <button onclick={stepBack}>← Step Back</button>
    <button onclick={stepFwd}>Step Fwd →</button>
    &nbsp;
    <label>
      Step size (ms):
      <input type="number" min="100" max="60000" bind:value={stepMs} style="width: 6em">
    </label>

    <br><br>

    <label>
      Speed:
      <select onchange={handleSpeed} value={speed}>
        <option value={0.5}>0.5×</option>
        <option value={0.75}>0.75×</option>
        <option value={1.0}>1×</option>
        <option value={1.5}>1.5×</option>
        <option value={2.0}>2×</option>
      </select>
    </label>
    &nbsp;
    <label>
      <input type="checkbox" checked={looping} onchange={handleLoop}>
      Loop
    </label>
  </section>

  <!-- ── Markers ───────────────────────────────────────────── -->
  <section>
    <h2>Markers</h2>
    <p>Current position: <strong>{formatMs(positionMs)}</strong></p>

    <button onclick={() => addMarker('start')}>Add Start</button>
    <button onclick={() => addMarker('end')}>Add End</button>
    <button onclick={() => addMarker('startEnd')}>Add Start+End</button>

    {#if markers.length === 0}
      <p>No markers yet.</p>
    {:else}
      <table border="1" cellpadding="4">
        <thead>
          <tr>
            <th>#</th>
            <th>Position</th>
            <th>Kind</th>
            <th>Rename Segment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each markers as m, i}
            <tr>
              <td>{i + 1}</td>
              <td>{formatMs(m.position)}</td>
              <td>{kindLabel(m.kind)}</td>
              <td>
                {#if m.kind !== 'end'}
                  <input
                    type="text"
                    placeholder="Segment title…"
                    value={renameInputs[m.id] ?? ''}
                    oninput={(e) => {
                      renameInputs = {
                        ...renameInputs,
                        [m.id]: (e.currentTarget as HTMLInputElement).value,
                      };
                    }}
                    style="width: 14em"
                  />
                  <button onclick={() => renameSegment(m.id)}>Rename</button>
                {/if}
              </td>
              <td>
                <button onclick={() => deleteMarker(m.id)}>Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <!-- ── Segments / Export ─────────────────────────────────── -->
  <section>
    <h2>Segments &amp; Export</h2>

    <button onclick={validate}>Validate Markers</button>
    &nbsp;
    <button onclick={exportCsv}>Export CSV…</button>

    {#if segments !== null}
      {#if segments.length === 0}
        <p>Validation passed — no segments (no markers placed).</p>
      {:else}
        <p>Validation passed — {segments.length} segment(s):</p>
        <table border="1" cellpadding="4">
          <thead>
            <tr>
              <th>#</th>
              <th>Start</th>
              <th>End</th>
              <th>Title</th>
            </tr>
          </thead>
          <tbody>
            {#each segments as seg, i}
              <tr>
                <td>{i + 1}</td>
                <td>{formatMs(seg.startMs)}</td>
                <td>{formatMs(seg.endMs)}</td>
                <td>{seg.title}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </section>

  {/if}
</main>
