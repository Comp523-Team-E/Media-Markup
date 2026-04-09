<script lang="ts">
  import { appState } from '$lib/state.svelte';

  let { onOpenFile, onExportAudioSegments }: {
    onOpenFile: () => void;
    onExportAudioSegments: () => void;
  } = $props();
</script>

<header class="header">
  <div class="header-left">
    <h1 class="app-title">Media Segment Marker</h1>
    <p class="app-sub">Precision audio/video segmentation tool</p>
  </div>
  <div class="header-right">
    {#if appState.error}
      <span class="error-badge">{appState.error}</span>
    {/if}
    <button class="btn-export" onclick={onOpenFile}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      Open File
    </button>
    <button class="btn-export" onclick={onExportAudioSegments}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Export 
    </button>
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

  .error-badge {
    font-size: 11px;
    color: #f87171;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
</style>
