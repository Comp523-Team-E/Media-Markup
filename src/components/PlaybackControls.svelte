<script lang="ts">
  import { appState } from '$lib/state.svelte';
  import { formatMsDisplay, SPEEDS } from '$lib/utils';

  let { onStepBack, onTogglePlay, onStepFwd, onSetSpeed, onToggleLoop, onToggleFollow }: {
    onStepBack: () => Promise<void>;
    onTogglePlay: () => Promise<void>;
    onStepFwd: () => Promise<void>;
    onSetSpeed: (s: number) => Promise<void>;
    onToggleLoop: (enabled: boolean) => Promise<void>;
    onToggleFollow: (enabled: boolean) => void;
  } = $props();
</script>

<div class="controls-bar">
  <div class="controls-left">
    <button class="ctrl-btn" onclick={onStepBack} title="Step back">
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
    </button>
    <button class="play-btn" onclick={onTogglePlay} title={appState.isPlaying ? 'Pause' : 'Play'}>
      {#if appState.isPlaying}
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M8 5v14l11-7z"/></svg>
      {/if}
    </button>
    <button class="ctrl-btn" onclick={onStepFwd} title="Step forward">
      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
    </button>
  </div>

  <div class="controls-right">
    <div class="speed-group">
      <span class="controls-label">Speed</span>
      {#each SPEEDS as s}
        <button
          class="speed-btn"
          class:speed-active={appState.speed === s}
          onclick={() => onSetSpeed(s)}
        >{s}x</button>
      {/each}
    </div>

    <div class="toggle-group">
      <button
        class="toggle-btn"
        class:toggle-active={appState.looping}
        onclick={() => onToggleLoop(!appState.looping)}
        title="Loop playback"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
        Loop
      </button>
      <button
        class="toggle-btn"
        class:toggle-active={appState.followPlayhead}
        onclick={() => onToggleFollow(!appState.followPlayhead)}
        title="Follow playhead while zoomed"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
        Follow
      </button>
    </div>

    <span class="time-display">
      {formatMsDisplay(appState.positionMs, appState.durationMs)} / {formatMsDisplay(appState.durationMs, appState.durationMs)}
    </span>
  </div>
</div>

<style>
  .controls-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid #21262d;
    background: #0f1419;
    flex-shrink: 0;
  }

  .controls-left {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: #8b949e;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .ctrl-btn:hover { color: #e2e8f0; background: #1e2a3a; }

  .play-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: #2563eb;
    border: none;
    border-radius: 50%;
    color: #fff;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
  }

  .play-btn:hover { background: #1d4ed8; }
  .play-btn:active { transform: scale(0.95); }

  .controls-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .controls-label {
    font-size: 11px;
    color: #8b949e;
  }

  .speed-group {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .speed-btn {
    padding: 3px 7px;
    background: #1e2a3a;
    border: 1px solid #30363d;
    border-radius: 5px;
    color: #8b949e;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .speed-btn:hover { color: #e2e8f0; border-color: #4d6a8a; }

  .speed-active {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff !important;
  }

  .toggle-group {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 3px;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: transparent;
    border: none;
    border-radius: 5px;
    color: #8b949e;
    font-size: 11px;
    cursor: pointer;
    user-select: none;
    transition: color 0.15s, background 0.15s;
  }

  .toggle-btn:hover { color: #c9d1d9; background: #1e2a3a; }

  .toggle-active {
    background: #1d3a6e;
    color: #60a5fa;
  }

  .toggle-active:hover { background: #1e3f7a; color: #93c5fd; }

  .time-display {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: #3b82f6;
    font-weight: 600;
    white-space: nowrap;
  }
</style>
