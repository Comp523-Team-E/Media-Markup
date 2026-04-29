import type { MarkerKind } from './types';

export function formatMs(ms: number): string {
  const h   = Math.floor(ms / 3_600_000);
  const m   = Math.floor((ms % 3_600_000) / 60_000);
  const s   = Math.floor((ms % 60_000) / 1000);
  const mil = Math.floor(ms % 1000);
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + '.' +
    String(mil).padStart(3, '0')
  );
}

// Formats ms using the same component structure as refMs, with no leading
// zeros on the most-significant unit. Used for the playback time display so
// the position and duration strings are always the same width.
export function formatMsDisplay(ms: number, refMs: number): string {
  const refH = Math.floor(refMs / 3_600_000);
  const h    = Math.floor(ms / 3_600_000);
  const m    = Math.floor((ms % 3_600_000) / 60_000);
  const s    = Math.floor((ms % 60_000) / 1000);
  const mil  = Math.floor(ms % 1000);
  const ss   = String(s).padStart(2, '0');
  const mmm  = String(mil).padStart(3, '0');
  if (refH >= 1) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}.${mmm}`;
  }
  const refM = Math.floor(refMs / 60_000);
  if (refM >= 1) {
    return `${m}:${ss}.${mmm}`;
  }
  return `${s}.${mmm}`;
}

export function kindLabel(kind: MarkerKind): string {
  if (kind === 'start') return 'Start';
  if (kind === 'end')   return 'End';
  return 'Start+End';
}

export const SPEEDS = [0.5, 0.75, 1, 1.5, 2];
export const ZOOM_DEFAULT = 1;
export const ZOOM_MIN = 0.25;
export const ZOOM_STEP_FACTOR = 2;
export const ZOOM_HARD_LIMIT = 1_000;
export const ZOOM_MAX_WINDOW_MS = 256 * 60_000;
export const ZOOM_MIN_WINDOW_MS = 7_500;
export const ZOOM_WHEEL_SENSITIVITY = 1 / 480;
export const ZOOM_PINCH_SENSITIVITY = 3 / 700;

function roundZoom(level: number): number {
  return Number(level.toFixed(6));
}

export function clampZoomMin(level: number): number {
  return roundZoom(Math.max(level, ZOOM_MIN));
}

export function clampZoom(level: number): number {
  return roundZoom(Math.min(Math.max(level, ZOOM_MIN), ZOOM_HARD_LIMIT));
}

export function maxZoomForDuration(durationMs: number): number {
  if (durationMs <= 0) return ZOOM_MIN;
  const maxFromMinWindow = clampZoom(Math.max(ZOOM_MIN, durationMs / ZOOM_MIN_WINDOW_MS));
  return Math.max(maxFromMinWindow, minZoomForDuration(durationMs));
}

export function minZoomForDuration(durationMs: number): number {
  if (durationMs <= 0) return ZOOM_DEFAULT;
  return ZOOM_DEFAULT;
}

function applyZoomBoundaries(level: number, durationMs: number): number {
  const minZoom = minZoomForDuration(durationMs);
  const maxZoom = maxZoomForDuration(durationMs);
  return roundZoom(Math.min(Math.max(level, minZoom), maxZoom));
}

export function zoomInLevel(level: number, durationMs: number, step = 1): number {
  return applyZoomBoundaries(level * ZOOM_STEP_FACTOR ** Math.max(step, 0), durationMs);
}

export function zoomOutLevel(level: number, durationMs: number, step = 1): number {
  return applyZoomBoundaries(level / ZOOM_STEP_FACTOR ** Math.max(step, 0), durationMs);
}

export interface WheelZoomInput {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function shouldHandleWheelZoom(input: WheelZoomInput): boolean {
  if (input.ctrlKey || input.metaKey) return input.deltaY !== 0;
  return Math.abs(input.deltaY) > Math.abs(input.deltaX);
}

export function zoomFromWheelDelta(level: number, deltaY: number, durationMs: number, isPinch: boolean): number {
  const sensitivity = isPinch ? ZOOM_PINCH_SENSITIVITY : ZOOM_WHEEL_SENSITIVITY;
  const effectiveDelta = isPinch ? -deltaY : deltaY;
  const factor = 2 ** (effectiveDelta * sensitivity);
  return applyZoomBoundaries(level * factor, durationMs);
}

export function computeZoomedScrollLeftCentered(params: {
  scrollLeft: number;
  viewportWidth: number;
  prevZoom: number;
  nextZoom: number;
}): number {
  const { scrollLeft, viewportWidth, prevZoom, nextZoom } = params;
  const ratio = nextZoom / prevZoom;
  const centerPx = scrollLeft + viewportWidth / 2;
  return Math.max(0, centerPx * ratio - viewportWidth / 2);
}

// Parses a flexible time string back to milliseconds. Accepted formats:
//   "5"          → 5 seconds
//   "5.5"        → 5.5 seconds (500 ms)
//   "1:30"       → 1 min 30 s
//   "1:30.5"     → 1 min 30.5 s
//   "1:30:00"    → 1 h 30 min
//   "HH:MM:SS.mmm" → exact format produced by formatMs
// Millisecond digits are padded/truncated to 3 places.
// Returns null if the string cannot be interpreted.
export function parseTimeMs(value: string): number | null {
  const s = value.trim();
  if (!s) return null;

  const parts = s.split(':');
  if (parts.length > 3) return null;

  // Last segment may carry a decimal for sub-second precision
  const lastPart = parts[parts.length - 1];
  const dotIdx   = lastPart.indexOf('.');
  let secondsInt: number;
  let millis = 0;

  if (dotIdx !== -1) {
    const secStr = lastPart.slice(0, dotIdx);
    const milStr = lastPart.slice(dotIdx + 1);
    secondsInt = parseInt(secStr || '0', 10);
    // Pad to 3 digits (e.g. "5" → "500", "50" → "500", "500" → "500")
    const milPadded = milStr.slice(0, 3).padEnd(3, '0');
    millis = parseInt(milPadded, 10);
  } else {
    secondsInt = parseInt(lastPart || '0', 10);
  }

  if (isNaN(secondsInt) || isNaN(millis)) return null;

  let minutes = 0;
  let hours   = 0;

  if (parts.length >= 2) {
    minutes = parseInt(parts[parts.length - 2] || '0', 10);
    if (isNaN(minutes) || minutes > 59) return null;
  }
  if (parts.length === 3) {
    hours = parseInt(parts[0] || '0', 10);
    if (isNaN(hours)) return null;
  }

  // Seconds must be 0–59 when part of a compound expression (1:90 is invalid)
  if (parts.length > 1 && secondsInt > 59) return null;

  return hours * 3_600_000 + minutes * 60_000 + secondsInt * 1_000 + millis;
}
