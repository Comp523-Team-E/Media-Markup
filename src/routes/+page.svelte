<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '$lib/state.svelte';
  import {
    stopPolling, stopRaf, handleKeydown,
    openFile, importCsv, togglePlay, setSpeed, handleLoop,
    addMarkerNoKind, addMarkerAt, deleteMarker,
    renameSegment, exportAudioSegments,
    stepBack, stepFwd,
  } from '$lib/actions';

  import WelcomeScreen from '../components/WelcomeScreen.svelte';
  import Header from '../components/Header.svelte';
  import WaveformDisplay from '../components/WaveformDisplay.svelte';
  import PlaybackControls from '../components/PlaybackControls.svelte';
  import MarkerPanel from '../components/MarkerPanel.svelte';
  import SegmentPanel from '../components/SegmentPanel.svelte';
  import ShortcutsPanel from '../components/ShortcutsPanel.svelte';

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    stopPolling();
    stopRaf();
    if (appState.wavesurfer) appState.wavesurfer.destroy();
  });
</script>

{#if !appState.metadata}
  <WelcomeScreen onOpenFile={openFile} />
{:else}
  <div class="app">
    <Header onOpenFile={openFile}
            onImportCsv={importCsv}
            onExportAudioSegments={exportAudioSegments}
    />
    <WaveformDisplay />
    <PlaybackControls
      onStepBack={stepBack}
      onTogglePlay={togglePlay}
      onStepFwd={stepFwd}
      onSetSpeed={setSpeed}
      onToggleLoop={handleLoop}
    />
    <div class="panels">
      <MarkerPanel
        onAddMarkerNoKind={addMarkerNoKind}
        onDeleteMarker={deleteMarker}
        onAddMarkerAt={addMarkerAt}
      />
      <SegmentPanel onRenameSegment={renameSegment} />
      <ShortcutsPanel />
    </div>
  </div>
{/if}

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    background: #0d1117;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    overflow: hidden;
    height: 100vh;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .panels {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  :global(::-webkit-scrollbar) { width: 6px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: #30363d; border-radius: 3px; }
  :global(::-webkit-scrollbar-thumb:hover) { background: #4d5b6b; }
</style>
