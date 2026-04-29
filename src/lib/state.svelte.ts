import type WaveSurfer from 'wavesurfer.js';
import type { FileMetadata, Marker, Segment } from './types';
import { DEFAULT_SHORTCUTS } from './shortcuts';
import type { ShortcutConfig } from './shortcuts';

class AppState {
  // ── Displayed in UI (reactive) ─────────────────────────────────────────
  metadata        = $state<FileMetadata | null>(null);
  positionMs      = $state(0);
  durationMs      = $state(0);
  isPlaying       = $state(false);
  markers         = $state<Marker[]>([]);
  segments        = $state<Segment[] | null>(null);
  error           = $state<string | null>(null);
  successMessage  = $state<string | null>(null);
  stepMs          = $state(5000);
  speed           = $state(1.0);
  looping         = $state(false);
  followPlayhead  = $state(false);
  renameInputs    = $state<Record<string, string>>({});
  selectedMarkerId  = $state<string | null>(null);
  validationError   = $state<string | null>(null);
  editingMarkerId   = $state<string | null>(null);
  editingPositionMs = $state(0);
  nudgeStepMs       = 100;
  unkindedMarkers = $state<Set<string>>(new Set());
  shortcuts = $state<ShortcutConfig>({ ...DEFAULT_SHORTCUTS });
  // Lets the RAF in +page.svelte skip interpolation during waveform drag
  waveformDragging = $state(false);

  // ── Timing references (non-reactive) ──────────────────────────────────
  syncPositionMs = 0;
  syncWallTime   = 0;

  // ── WaveSurfer instance (non-reactive, set by WaveformDisplay) ────────
  wavesurfer: WaveSurfer | null = null;

  // ── Zoom (reactive) + scroll container ref (non-reactive) ─────────────
  zoomLevel = $state(1);  // 1 = 100% (waveform fills viewport width)
  waveformWrapEl: HTMLDivElement | null = null;
}

export const appState = new AppState();
