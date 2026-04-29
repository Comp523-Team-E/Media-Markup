<script lang="ts">
  import { onMount } from 'svelte';
  import { appState } from '$lib/state.svelte';
  import { formatMs, parseTimeMs } from '$lib/utils';
  import { selectMarker, enterEditMode, cancelEditMode, confirmEditMode } from '$lib/actions';
  import { formatShortcutKey } from '$lib/shortcuts';
  import { validationProblemMarkerIds } from '$lib/validation';
  import type { MarkerKind } from '$lib/types';

  let { onAddMarkerNoKind, onDeleteMarker, onAddMarkerAt, onSplitStartEndMarker }: {
    onAddMarkerNoKind: () => Promise<void>;
    onDeleteMarker: (id: string) => Promise<void>;
    onAddMarkerAt: (kind: MarkerKind, pos: number) => Promise<void>;
    onSplitStartEndMarker: (id: string) => Promise<void>;
  } = $props();

  // Local string state for the edit input — avoids fighting the user while typing
  let editInputValue = $state('');
  // True while the user has the edit input focused; suppresses the $effect reset
  let isTyping = false;
  let compactMarkerTypes = $state(false);
  let markerListEl = $state<HTMLDivElement | null>(null);
  const validationProblemIds = $derived(validationProblemMarkerIds(appState.markers, appState.validationError));

  onMount(() => {
    const media = window.matchMedia('(max-width: 650px)');
    const updateCompactTypes = () => {
      compactMarkerTypes = media.matches;
    };
    updateCompactTypes();
    media.addEventListener('change', updateCompactTypes);
    return () => media.removeEventListener('change', updateCompactTypes);
  });

  // Sync the input display when the draft position changes externally (nudge or mode entry)
  // but not while the user is actively typing in the field.
  $effect(() => {
    if (appState.editingMarkerId !== null && !isTyping) {
      editInputValue = formatMs(appState.editingPositionMs);
    }
  });

  $effect(() => {
    const selectedId = appState.selectedMarkerId;
    if (!selectedId || !markerListEl) return;

    queueMicrotask(() => {
      const row = markerListEl?.querySelector<HTMLElement>(`[data-marker-id="${CSS.escape(selectedId)}"]`);
      row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  });

</script>

<div class="panel">
  <div class="panel-header">
    <h3 class="panel-title">Markers ({appState.markers.length})</h3>
    <button class="btn-sm" onclick={onAddMarkerNoKind}>Add Marker</button>
  </div>

  {#if appState.markers.length === 0}
    <p class="empty-state">
      No markers yet. Use the Add Marker button or press <kbd>{formatShortcutKey(appState.shortcuts.addStartMarker[0])}</kbd>, <kbd>{formatShortcutKey(appState.shortcuts.addEndMarker[0])}</kbd>, or <kbd>{formatShortcutKey(appState.shortcuts.addStartEndMarker[0])}</kbd>.
    </p>
  {:else}
    <div class="marker-list" bind:this={markerListEl}>
      {#each [...appState.markers].sort((a, b) => b.position - a.position) as m (m.id)}
        <div
          class="marker-row"
          class:marker-row-has-split={m.kind === 'startEnd'}
          class:marker-row-selected={appState.selectedMarkerId === m.id}
          class:marker-row-editing={appState.editingMarkerId === m.id}
          class:marker-row-validation-error={validationProblemIds.has(m.id)}
          data-marker-id={m.id}
          onclick={() => { selectMarker(m.id); }}
          role="button"
          tabindex="0"
          onkeydown={(e) => { if (e.key === 'Enter') selectMarker(m.id); }}
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
            <span class="marker-time copyable-text">{formatMs(m.position)}</span>
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
              <option value="" disabled selected>{compactMarkerTypes ? 'Type…' : 'Select type…'}</option>
            {/if}
            <option value="start">{compactMarkerTypes ? 'S' : 'Start'}</option>
            <option value="end">{compactMarkerTypes ? 'E' : 'End'}</option>
            <option value="startEnd">{compactMarkerTypes ? 'S+E' : 'Start+End'}</option>
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
          {#if m.kind === 'startEnd'}
            <button
              class="split-btn"
              onclick={(e) => { e.stopPropagation(); onSplitStartEndMarker(m.id); }}
              title="Split into Start + End markers (X)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="6" cy="6" r="3"/>
                <circle cx="6" cy="18" r="3"/>
                <line x1="20" y1="4" x2="8.12" y2="15.88"/>
                <line x1="14.47" y1="14.48" x2="20" y2="20"/>
                <line x1="8.12" y1="8.12" x2="12" y2="12"/>
              </svg>
            </button>
          {:else}
            <span class="split-placeholder"></span>
          {/if}
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
    overflow: auto;
    padding: 4px 0;
    min-width: 0;
  }

  .marker-row {
    display: grid;
    grid-template-columns: 8px minmax(86px, 1fr) minmax(64px, 88px) 26px minmax(0, 8px) 26px;
    align-items: center;
    column-gap: 8px;
    padding: 7px 14px;
    width: 100%;
    min-height: 41px;
    cursor: pointer;
    border-bottom: 1px solid #161b22;
    transition: background 0.1s;
  }

  .marker-row:hover { background: #161b22; }

  .marker-row.marker-row-has-split {
    grid-template-columns: 8px minmax(86px, 1fr) minmax(64px, 88px) 26px 26px 26px;
  }

  .marker-row-selected { background: #1a2640 !important; }

  .marker-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-start  { background: #22c55e; }
  .dot-end    { background: #f87171; }
  .dot-both   { background: linear-gradient(to bottom, #22c55e 0 50%, #f87171 50% 100%); }

  .marker-time {
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: #c9d1d9;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kind-select {
    width: 100%;
    min-width: 0;
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

  .marker-row-validation-error {
    background: rgba(127, 29, 29, 0.22) !important;
    border-left: 2px solid #f87171;
  }

  .edit-time-input {
    width: 100%;
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

  .split-btn {
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

  .split-btn:hover { color: #facc15; border-color: #facc15; background: #1e1c0a; }

  .split-placeholder {
    width: 100%;
    height: 26px;
    flex-shrink: 0;
  }

  @media (max-width: 650px) {
    .marker-row {
      grid-template-columns: 8px minmax(82px, 1fr) minmax(48px, 56px) 26px minmax(0, 8px) 26px;
      column-gap: 6px;
    }

    .marker-row.marker-row-has-split {
      grid-template-columns: 8px minmax(82px, 1fr) minmax(48px, 56px) 26px 26px 26px;
    }

    .kind-select {
      padding-left: 4px;
      padding-right: 4px;
    }
  }
</style>
