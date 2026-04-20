<script lang="ts">
  import { appState } from '$lib/state.svelte';

  let { collapsed = false, onToggleCollapsed }: {
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
  } = $props();
</script>

<div class="panel shortcuts-panel" class:shortcuts-collapsed={collapsed}>
  <div class="panel-header">
    <h3 class="panel-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M10 12h4M6 16h12"/>
      </svg>
      {#if !collapsed}
        Keyboard Shortcuts
      {/if}
    </h3>
    <button
      class="collapse-btn"
      onclick={onToggleCollapsed}
      title={collapsed ? 'Show keyboard shortcuts' : 'Hide keyboard shortcuts'}
      aria-label={collapsed ? 'Show keyboard shortcuts' : 'Hide keyboard shortcuts'}
    >
      {collapsed ? '‹' : '›'}
    </button>
  </div>
  {#if !collapsed}
    <div class="shortcut-list">
      <div class="shortcut-subheading">Control Playback</div>
      <div class="shortcut-row"><kbd>Space</kbd><span>Play/Pause</span></div>
      <div class="shortcut-row">
        <kbd>←/→</kbd>
        <span class="seek-step-label">
          Seek ±
          <input class="step-input" type="number" min="100" max="60000" bind:value={appState.stepMs} />
          ms
        </span>
      </div>
      <div class="shortcut-row"><kbd>1–5</kbd><span>Playback Speed</span></div>

      <div class="shortcut-subheading">Waveform Zoom</div>
      <div class="shortcut-row"><kbd>-</kbd><span>Zoom out</span></div>
      <div class="shortcut-row"><kbd>+</kbd><span>Zoom in</span></div>

      <div class="shortcut-subheading">Add Marker</div>
      <div class="shortcut-row"><kbd>S</kbd><span>Start</span></div>
      <div class="shortcut-row"><kbd>E</kbd><span>End</span></div>
      <div class="shortcut-row"><kbd>B</kbd><span>Start+End</span></div>

      <div class="shortcut-subheading">Manage Markers</div>
      <div class="shortcut-row"><kbd>D</kbd><span>Previous Marker</span></div>
      <div class="shortcut-row"><kbd>F</kbd><span>Next Marker</span></div>
      <div class="shortcut-row"><kbd>X</kbd><span>Split Start+End Marker</span></div>
      <div class="shortcut-row"><kbd>Del</kbd><span>Delete Selected Marker</span></div>

      <div class="shortcut-subheading">Edit Marker</div>
      <div class="shortcut-row"><kbd>[</kbd><span>Nudge left 100ms</span></div>
      <div class="shortcut-row"><kbd>]</kbd><span>Nudge right 100ms</span></div>
      <div class="shortcut-row"><kbd>Enter</kbd><span>Confirm position</span></div>
      <div class="shortcut-row"><kbd>Esc</kbd><span>Cancel editing</span></div>

      <div class="shortcut-subheading">Export</div>
      <div class="shortcut-row"><kbd>Ctrl+E</kbd><span>Export CSV</span></div>
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .shortcuts-panel {
    background: #0f1419;
  }

  .shortcuts-collapsed {
    align-items: stretch;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }

  .shortcuts-collapsed .panel-header {
    justify-content: center;
    padding: 10px 6px 8px;
    gap: 8px;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #c9d1d9;
  }

  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    background: #1e2a3a;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #8b949e;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }

  .collapse-btn:hover {
    color: #e2e8f0;
    border-color: #4d6a8a;
  }

  .shortcut-list {
    padding: 8px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .shortcut-row kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    padding: 4px 8px;
    background: #1e2a3a;
    border: 1px solid #30363d;
    border-radius: 6px;
    font-size: 11px;
    color: #c9d1d9;
    font-family: inherit;
    white-space: nowrap;
  }

  .shortcut-row span {
    font-size: 12px;
    color: #8b949e;
  }

  .shortcut-subheading {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #4b5563;
    margin-top: 10px;
    margin-bottom: 2px;
  }

  .seek-step-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .step-input {
    width: 80px;
    padding: 4px 8px;
    background: #1e2a3a;
    border: 1px solid #30363d;
    border-radius: 5px;
    color: #c9d1d9;
    font-size: 11px;
    outline: none;
    text-align: right;
  }

  .step-input:focus { border-color: #2563eb; }
</style>
