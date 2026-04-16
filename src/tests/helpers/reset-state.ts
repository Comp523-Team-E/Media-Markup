import { appState } from '$lib/state.svelte';

export function resetAppState() {
  appState.metadata         = null;
  appState.positionMs       = 0;
  appState.durationMs       = 0;
  appState.isPlaying        = false;
  appState.markers          = [];
  appState.segments         = null;
  appState.error            = null;
  appState.stepMs           = 5000;
  appState.speed            = 1.0;
  appState.looping          = false;
  appState.followPlayhead   = false;
  appState.renameInputs     = {};
  appState.selectedMarkerId  = null;
  appState.validationError   = null;
  appState.editingMarkerId   = null;
  appState.editingPositionMs = 0;
  appState.unkindedMarkers  = new Set();
  appState.waveformDragging = false;
  appState.syncPositionMs   = 0;
  appState.syncWallTime     = 0;
  appState.wavesurfer       = null;
  appState.zoomLevel        = 1;
  appState.waveformWrapEl   = null;
}
