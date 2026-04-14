<script lang="ts">
  import { appState } from '$lib/state.svelte';

  let { onOpenFile, onImportCsv, onExportAudioSegments }: {
    onOpenFile: () => void;
    onImportCsv: () => void;
    onExportAudioSegments: (exportCsv: boolean, exportAudio: boolean) => void;
  } = $props();

  let exportDropdownOpen = $state(false);
  let exportCsv = $state(true);
  let exportAudio = $state(true);

  function toggleDropdown() {
    exportDropdownOpen = !exportDropdownOpen;
  }

  function closeDropdown() {
    exportDropdownOpen = false;
  }
</script>

<header class="header">
  <div class="header-left">
    <h1 class="app-title">Media Segment Marker</h1>
    <p class="app-sub">Precision audio/video segmentation tool</p>
  </div>
  <div class="header-right">
    <button class="btn-export" onclick={onOpenFile}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      Open File
    </button>
    <button class="btn-export" onclick={onImportCsv}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      Import CSV
    </button>
    <div class="export-wrapper">
      <button class="btn-export" onclick={toggleDropdown}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export
        <svg class="chevron" class:open={exportDropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if exportDropdownOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="export-backdrop" role="presentation" onclick={closeDropdown}></div>
        <div class="export-dropdown">
          <label class="export-option">
            <input type="checkbox" bind:checked={exportCsv} />
            <span>CSV</span>
          </label>
          <label class="export-option">
            <input type="checkbox" bind:checked={exportAudio} />
            <span>Audio Segments</span>
          </label>
          <hr class="export-divider" />
          <button
            class="export-go"
            disabled={(!exportCsv && !exportAudio) || !appState.segments?.length}
            onclick={() => { onExportAudioSegments(exportCsv, exportAudio); closeDropdown(); }}
          >
            Export
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }

  .app-title {
    font-size: 16px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .app-sub {
    font-size: 11px;
    color: #8b949e;
    margin-top: 1px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-export {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: #1e2a3a;
    color: #e2e8f0;
    border: 1px solid #30363d;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .btn-export:hover { background: #263548; border-color: #4d6a8a; }

  .chevron { transition: transform 0.15s; }
  .chevron.open { transform: rotate(180deg); }

  .export-wrapper {
    position: relative;
  }

  .export-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
  }

  .export-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 11;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 8px;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .export-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    color: #e2e8f0;
  }

  .export-option:hover { background: #1e2a3a; }

  .export-option input[type="checkbox"] {
    accent-color: #4d6a8a;
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .export-divider {
    border: none;
    border-top: 1px solid #21262d;
    margin: 4px 0;
  }

  .export-go {
    width: 100%;
    padding: 6px 10px;
    background: #1e2a3a;
    color: #e2e8f0;
    border: 1px solid #30363d;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .export-go:hover:not(:disabled) { background: #263548; border-color: #4d6a8a; }

  .export-go:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
