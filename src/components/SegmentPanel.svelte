<script lang="ts">
  import { appState } from '$lib/state.svelte';
  import { formatMs } from '$lib/utils';
  import { computePreviewSegments } from '$lib/actions';

  let { onRenameSegment }: {
    onRenameSegment: (anchorId: string) => Promise<void>;
  } = $props();

  const displaySegments = $derived(computePreviewSegments());
  const isPreviewing    = $derived(appState.editingMarkerId !== null);
</script>

<div class="panel">
  <div class="panel-header">
    <h3 class="panel-title">Segments ({displaySegments.length})</h3>
  </div>

  {#if appState.validationError}
    <p class="validation-error">{appState.validationError}</p>
  {/if}

  {#if displaySegments.length === 0}
    <p class="empty-state">No segments yet. Add start and end markers to create segments.</p>
  {:else}
    <div class="segment-list" class:segment-list-preview={isPreviewing}>
      {#each [...displaySegments].sort((a, b) => b.endMs - a.endMs) as seg, i}
        <div class="segment-row">
          <span class="seg-index">{String(i + 1).padStart(3, '0')}</span>
          <div class="seg-times">
            <span class="seg-start copyable-text">{formatMs(seg.startMs)}</span>
            <span class="seg-arrow">→</span>
            <span class="seg-end copyable-text">{formatMs(seg.endMs)}</span>
          </div>
          <div class="seg-title-wrap">
            <input
              class="seg-title-input"
              type="text"
              placeholder="Segment title…"
              value={appState.renameInputs[appState.markers.find(mk => mk.kind !== 'end' && mk.position === seg.startMs)?.id ?? ''] ?? seg.title}
              oninput={(e) => {
                const anchor = appState.markers.find(mk => mk.kind !== 'end' && mk.position === seg.startMs);
                if (anchor) {
                  appState.renameInputs = { ...appState.renameInputs, [anchor.id]: (e.currentTarget as HTMLInputElement).value };
                }
              }}
              onblur={() => {
                const anchor = appState.markers.find(mk => mk.kind !== 'end' && mk.position === seg.startMs);
                if (anchor) onRenameSegment(anchor.id);
              }}
            />
          </div>
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

  .validation-error {
    margin: 8px 14px;
    padding: 6px 10px;
    background: #1e1010;
    border: 1px solid #7f1d1d;
    border-radius: 6px;
    color: #f87171;
    font-size: 11px;
    line-height: 1.5;
  }

  .segment-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .segment-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid #161b22;
  }

  .seg-index {
    font-variant-numeric: tabular-nums;
    color: #4d5b6b;
    font-size: 11px;
    flex-shrink: 0;
  }

  .seg-times {
    display: flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: #8b949e;
    flex-shrink: 0;
  }

  .seg-start { color: #22c55e; }
  .seg-end   { color: #f87171; }
  .seg-arrow { color: #4d5b6b; }

  .seg-title-wrap { flex: 1; min-width: 0; }

  .seg-title-input {
    width: 100%;
    padding: 4px 8px;
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 5px;
    color: #c9d1d9;
    font-size: 12px;
    outline: none;
    transition: border-color 0.15s;
  }

  .seg-title-input:focus { border-color: #2563eb; background: #1a2332; }
  .seg-title-input::placeholder { color: #4d5b6b; }

  .segment-list-preview { opacity: 0.75; }
</style>
