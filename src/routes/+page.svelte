<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '$lib/state.svelte';
  import {
    stopPolling, stopRaf, handleKeydown,
    openFile, importCsv, togglePlay, setSpeed, handleLoop,
    addMarkerNoKind, addMarkerAt, deleteMarker,
    renameSegment, exportAudioSegments,
    stepBack, stepFwd, handleFollowPlayhead
  } from '$lib/actions';

  import WelcomeScreen from '../components/WelcomeScreen.svelte';
  import Header from '../components/Header.svelte';
  import WaveformDisplay from '../components/WaveformDisplay.svelte';
  import PlaybackControls from '../components/PlaybackControls.svelte';
  import MarkerPanel from '../components/MarkerPanel.svelte';
  import SegmentPanel from '../components/SegmentPanel.svelte';
  import ShortcutsPanel from '../components/ShortcutsPanel.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import SuccessToast from '../components/SuccessToast.svelte';

  let shortcutsCollapsed = $state(false);

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    const media = window.matchMedia('(max-width: 900px)');
    const syncShortcutsLayout = () => {
      shortcutsCollapsed = media.matches;
    };
    syncShortcutsLayout();
    media.addEventListener('change', syncShortcutsLayout);

    return () => {
      document.removeEventListener('keydown', handleKeydown);
      media.removeEventListener('change', syncShortcutsLayout);
    };
  });

  onDestroy(() => {
    stopPolling();
    stopRaf();
    if (appState.wavesurfer) appState.wavesurfer.destroy();
  });
</script>

<ErrorAlert />
<SuccessToast />

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
      onToggleFollow={handleFollowPlayhead}
    />
	    <div class="panels" class:shortcuts-collapsed={shortcutsCollapsed}>
	      <MarkerPanel
	        onAddMarkerNoKind={addMarkerNoKind}
	        onDeleteMarker={deleteMarker}
	        onAddMarkerAt={addMarkerAt}
	      />
	      <SegmentPanel onRenameSegment={renameSegment} />
	      <ShortcutsPanel
	        collapsed={shortcutsCollapsed}
	        onToggleCollapsed={() => { shortcutsCollapsed = !shortcutsCollapsed; }}
	      />
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
	    grid-template-columns: minmax(180px, 1fr) minmax(260px, 2fr) minmax(180px, 1fr);
	    flex: 1;
	    overflow: hidden;
	    min-height: 0;
	  }

	  .panels.shortcuts-collapsed {
	    grid-template-columns: minmax(180px, 1fr) minmax(260px, 2fr) 58px;
	  }

	  @media (max-width: 900px) {
	    .panels {
	      grid-template-columns: minmax(160px, 1fr) minmax(240px, 2fr) minmax(170px, 0.9fr);
	    }

	    .panels.shortcuts-collapsed {
	      grid-template-columns: minmax(160px, 1fr) minmax(240px, 2fr) 58px;
	    }
	  }

  :global(::-webkit-scrollbar) { width: 6px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: #30363d; border-radius: 3px; }
  :global(::-webkit-scrollbar-thumb:hover) { background: #4d5b6b; }
</style>
