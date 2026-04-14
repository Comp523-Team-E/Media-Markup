<script lang="ts">
  import { appState } from '$lib/state.svelte';
  import { formatMs, parseTimeMs } from '$lib/utils';
  import { enterEditMode, cancelEditMode, confirmEditMode } from '$lib/actions';
  import type { MarkerKind } from '$lib/types';

  let { onAddMarkerNoKind, onDeleteMarker, onAddMarkerAt }: {
    onAddMarkerNoKind: () => Promise<void>;
    onDeleteMarker: (id: string) => Promise<void>;
    onAddMarkerAt: (kind: MarkerKind, pos: number) => Promise<void>;
  } = $props();

  // Local string state for the edit input — avoids fighting the user while typing
  let editInputValue = $state('');
  // True while the user has the edit input focused; suppresses the $effect reset
  let isTyping = false;

  // Sync the input display when the draft position changes externally (nudge or mode entry)
  // but not while the user is actively typing in the field.
  $effect(() => {
    if (appState.editingMarkerId !== null && !isTyping) {
      editInputValue = formatMs(appState.editingPositionMs);
    }
  });

</script>

<div class="panel">
  <div class="panel-header">
    <h3 class="panel-title">Markers ({appState.markers.length})</h3>
    <button class="btn-sm" onclick={onAddMarkerNoKind}>Add Marker</button>
  </div>

  {#if appState.markers.length === 0}
    <p class="empty-state">
      No markers yet. Use the Add Marker button or press <kbd>S</kbd>, <kbd>E</kbd>, or <kbd>B</kbd>.
    </p>
  {:else}
    <div class="marker-list">
      {#each [...appState.markers].sort((a, b) => b.position - a.position) as m (m.id)}
        <div
          class="marker-row"
          class:marker-row-selected={appState.selectedMarkerId === m.id}
          class:marker-row-editing={appState.editingMarkerId === m.id}
          onclick={() => { appState.selectedMarkerId = m.id; }}
          role="button"
          tabindex="0"
          onkeydown={(e) => { if (e.key === 'Enter') appState.selectedMarkerId = m.id; }}
        >
          <span
            class="marker-dot"
            class:dot-start={m.kind === 'start'}
            class:dot-end={m.kind === 'end'}
            class:dot-both={m.kind === 'startEnd'}
          ></span>
          {#if appState.editingMarkerId === m.id}
            <input
              class="edit-time-input"
              type="text"
              bind:value={editInputValue}
              onfocus={() => { isTyping = true; }}
              onblur={() => {
                isTyping = false;
                // Reformat to canonical display if the user left without confirming
                editInputValue = formatMs(appState.editingPositionMs);
              }}
              oninput={() => {
                // Update the draft position in real-time so the waveform follows along
                const parsed = parseTimeMs(editInputValue);
                if (parsed !== null) {
                  appState.editingPositionMs = Math.max(0, Math.min(parsed, appState.durationMs));
                }
              }}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  isTyping = false;
                  // Apply whatever the user typed (flexible format) before saving
                  const parsed = parseTimeMs(editInputValue);
                  if (parsed !== null) {
                    appState.editingPositionMs = Math.max(0, Math.min(parsed, appState.durationMs));
                  }
                  confirmEditMode();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  isTyping = false;
                  cancelEditMode();
                }
              }}
            />
          {:else}
            <span class="marker-time">{formatMs(m.position)}</span>
          {/if}
          <select
            class="kind-select"
            class:kind-unselected={appState.unkindedMarkers.has(m.id)}
            value={appState.unkindedMarkers.has(m.id) ? '' : m.kind}
            onchange={async (e) => {
              const newKind = (e.currentTarget as HTMLSelectElement).value as MarkerKind;
              const wasUnkinded = appState.unkindedMarkers.has(m.id);
              if (wasUnkinded) {
                const s = new Set(appState.unkindedMarkers);
                s.delete(m.id);
                appState.unkindedMarkers = s;
              }
              if (newKind !== m.kind || wasUnkinded) {
                const pos = m.position;
                await onDeleteMarker(m.id);
                await onAddMarkerAt(newKind, pos);
              }
            }}
          >
            {#if appState.unkindedMarkers.has(m.id)}
              <option value="" disabled selected>Select type…</option>
            {/if}
            <option value="start">Start</option>
            <option value="end">End</option>
            <option value="startEnd">Start+End</option>
          </select>
          <button
            class="edit-btn"
            class:edit-btn-active={appState.editingMarkerId === m.id}
            onclick={(e) => {
              e.stopPropagation();
              if (appState.editingMarkerId === m.id) cancelEditMode();
              else enterEditMode(m.id);
            }}
            title={appState.editingMarkerId === m.id ? 'Cancel editing' : 'Edit marker position'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            class="delete-btn"
            onclick={(e) => { e.stopPropagation(); onDeleteMarker(m.id); }}
            title="Delete marker"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    border-right: 1px solid #21262d;
    overflow: hidden;
    min-height: 0;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #c9d1d9;
  }

  .empty-state {
    padding: 24px 16px;
    color: #4d5b6b;
    font-size: 12px;
    text-align: center;
    line-height: 1.6;
  }

  .empty-state kbd {
    padding: 1px 5px;
    background: #1e2a3a;
    border: 1px solid #30363d;
    border-radius: 4px;
    font-size: 11px;
    color: #8b949e;
  }

  .btn-sm {
    padding: 1px 10px;
    background: #1e2a3a;
    color: #8b949e;
    border: 1px solid #30363d;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .btn-sm:hover { background: #263548; color: #e2e8f0; }

  .marker-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .marker-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    cursor: pointer;
    border-bottom: 1px solid #161b22;
    transition: background 0.1s;
  }

  .marker-row:hover { background: #161b22; }

  .marker-row-selected { background: #1a2640 !important; }

  .marker-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-start  { background: #22c55e; }
  .dot-end    { background: #f87171; }
  .dot-both   { background: #facc15; }

  .marker-time {
    flex: 1;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: #c9d1d9;
  }

  .kind-select {
    padding: 3px 6px;
    background: #1e2a3a;
    border: 1px solid #30363d;
    border-radius: 5px;
    color: #8b949e;
    font-size: 11px;
    cursor: pointer;
    outline: none;
  }

  .kind-select:focus { border-color: #2563eb; }
  .kind-unselected { border-color: #ca8a04; color: #ca8a04; }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #4d5b6b;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .delete-btn:hover {
    color: #f87171;
    border-color: #f87171;
    background: #1e1010;
  }

  .marker-row-editing { background: #1e1a0e !important; border-left: 2px solid #f97316; }

  .edit-time-input {
    flex: 1;
    padding: 3px 6px;
    background: #1e2a3a;
    border: 1px solid #f97316;
    border-radius: 5px;
    color: #f97316;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    outline: none;
    min-width: 0;
  }

  .edit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #4d5b6b;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .edit-btn:hover { color: #f97316; border-color: #f97316; background: #1e1a0e; }
  .edit-btn-active { color: #f97316; border-color: #f97316; background: #1e1a0e; }
</style>
