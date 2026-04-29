import { describe, it, expect } from 'vitest';
import {
  formatMs,
  formatMsDisplay,
  kindLabel,
  SPEEDS,
  parseTimeMs,
  ZOOM_DEFAULT,
  ZOOM_MIN,
  ZOOM_STEP_FACTOR,
  ZOOM_PINCH_SENSITIVITY,
  ZOOM_WHEEL_SENSITIVITY,
  ZOOM_MIN_WINDOW_MS,
  ZOOM_MAX_WINDOW_MS,
  clampZoomMin,
  maxZoomForDuration,
  minZoomForDuration,
  zoomInLevel,
  zoomOutLevel,
  shouldHandleWheelZoom,
  zoomFromWheelDelta,
  computeZoomedScrollLeftCentered,
} from '$lib/utils';

describe('formatMs', () => {
  it('formats zero as 00:00:00.000', () => {
    expect(formatMs(0)).toBe('00:00:00.000');
  });

  it('formats sub-second values', () => {
    expect(formatMs(500)).toBe('00:00:00.500');
  });

  it('formats whole seconds', () => {
    expect(formatMs(1000)).toBe('00:00:01.000');
  });

  it('formats minutes', () => {
    expect(formatMs(90_000)).toBe('00:01:30.000');
  });

  it('formats hours', () => {
    expect(formatMs(3_600_000)).toBe('01:00:00.000');
  });

  it('formats a complex value', () => {
    expect(formatMs(3_661_001)).toBe('01:01:01.001');
  });

  it('pads all fields to correct width', () => {
    expect(formatMs(60_000)).toBe('00:01:00.000');
  });

  it('truncates (does not round) sub-millisecond values', () => {
    // Math.floor ensures 999.9ms stays 999
    expect(formatMs(999.9)).toBe('00:00:00.999');
  });
});

describe('kindLabel', () => {
  it('returns Start for start', () => {
    expect(kindLabel('start')).toBe('Start');
  });

  it('returns End for end', () => {
    expect(kindLabel('end')).toBe('End');
  });

  it('returns Start+End for startEnd', () => {
    expect(kindLabel('startEnd')).toBe('Start+End');
  });
});

describe('parseTimeMs', () => {
  it('returns null for an empty string', () => {
    expect(parseTimeMs('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseTimeMs('   ')).toBeNull();
  });

  it('parses plain whole seconds', () => {
    expect(parseTimeMs('5')).toBe(5_000);
  });

  it('parses seconds greater than 59 as total seconds (no colon)', () => {
    expect(parseTimeMs('90')).toBe(90_000);
  });

  it('parses decimal seconds — one ms digit is padded to three', () => {
    expect(parseTimeMs('5.5')).toBe(5_500);
  });

  it('parses decimal seconds — two ms digits are padded to three', () => {
    expect(parseTimeMs('5.50')).toBe(5_500);
  });

  it('parses decimal seconds — three ms digits exactly', () => {
    expect(parseTimeMs('5.500')).toBe(5_500);
  });

  it('truncates milliseconds beyond three digits', () => {
    expect(parseTimeMs('5.5009')).toBe(5_500);
  });

  it('parses MM:SS format', () => {
    expect(parseTimeMs('1:30')).toBe(90_000);
  });

  it('parses MM:SS.m format (single ms digit)', () => {
    expect(parseTimeMs('1:30.5')).toBe(90_500);
  });

  it('parses HH:MM:SS format', () => {
    expect(parseTimeMs('1:30:00')).toBe(5_400_000);
  });

  it('parses HH:MM:SS.mmm — the canonical format produced by formatMs', () => {
    expect(parseTimeMs('00:01:30.500')).toBe(90_500);
  });

  it('is the inverse of formatMs for arbitrary values', () => {
    const ms = 12_345;
    expect(parseTimeMs(formatMs(ms))).toBe(ms);
  });

  it('trims surrounding whitespace', () => {
    expect(parseTimeMs('  5  ')).toBe(5_000);
  });

  it('returns null for too many colon-separated parts', () => {
    expect(parseTimeMs('1:2:3:4')).toBeNull();
  });

  it('returns null for seconds out of range in MM:SS (1:90)', () => {
    expect(parseTimeMs('1:90')).toBeNull();
  });

  it('returns null for minutes out of range (1:60:00)', () => {
    expect(parseTimeMs('1:60:00')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseTimeMs('abc')).toBeNull();
  });

  it('returns null for partially numeric input', () => {
    expect(parseTimeMs('1:ab')).toBeNull();
  });
});

describe('zoom helpers', () => {
  it('uses 1.0 for default zoom (100%)', () => {
    expect(ZOOM_DEFAULT).toBe(1);
  });

  it('uses a minimum zoom less than default', () => {
    expect(ZOOM_MIN).toBeLessThan(ZOOM_DEFAULT);
  });

  it('uses a zoom-in step factor greater than 1', () => {
    expect(ZOOM_STEP_FACTOR).toBeGreaterThan(1);
  });

  it('clampZoomMin enforces the minimum zoom', () => {
    expect(clampZoomMin(0.001)).toBe(ZOOM_MIN);
  });

  it('exposes a duration-aware min zoom window cap', () => {
    expect(ZOOM_MAX_WINDOW_MS).toBeGreaterThan(ZOOM_MIN_WINDOW_MS);
  });

  it('max zoom scales up with longer files', () => {
    expect(maxZoomForDuration(3_600_000)).toBeGreaterThan(maxZoomForDuration(60_000));
  });

  it('min zoom keeps 100% as the zoom-out floor', () => {
    expect(minZoomForDuration(600_000)).toBe(1);
    expect(minZoomForDuration(8 * 3_600_000)).toBe(1);
  });

  it('zoomInLevel doubles at each step by default', () => {
    expect(zoomInLevel(1, 60_000)).toBeCloseTo(2, 6);
  });

  it('zoomOutLevel halves until duration-aware minimum is reached', () => {
    const duration = 8 * 3_600_000;
    expect(zoomOutLevel(1, duration)).toBe(minZoomForDuration(duration));
  });

  it('zoomOutLevel never drops below duration-aware min zoom', () => {
    expect(zoomOutLevel(0.2, 60_000)).toBe(minZoomForDuration(60_000));
  });
});

describe('wheel zoom helpers', () => {
  it('handles pinch-like wheel when ctrl is pressed', () => {
    expect(shouldHandleWheelZoom({ deltaX: 20, deltaY: 0.5, ctrlKey: true, metaKey: false })).toBe(true);
  });

  it('handles pinch-like wheel when meta is pressed', () => {
    expect(shouldHandleWheelZoom({ deltaX: 20, deltaY: 0.5, ctrlKey: false, metaKey: true })).toBe(true);
  });

  it('ignores mostly horizontal wheel motion without pinch modifiers', () => {
    expect(shouldHandleWheelZoom({ deltaX: 25, deltaY: 10, ctrlKey: false, metaKey: false })).toBe(false);
  });

  it('handles mostly vertical wheel motion without pinch modifiers', () => {
    expect(shouldHandleWheelZoom({ deltaX: 5, deltaY: 30, ctrlKey: false, metaKey: false })).toBe(true);
  });

  it('uses slower pinch sensitivity than wheel sensitivity', () => {
    expect(ZOOM_PINCH_SENSITIVITY).toBeLessThan(ZOOM_WHEEL_SENSITIVITY);
  });

  it('pinch delta changes zoom less than regular wheel delta', () => {
    const base = 10;
    const wheel = zoomFromWheelDelta(base, -120, 3_600_000, false);
    const pinch = zoomFromWheelDelta(base, -120, 3_600_000, true);
    // Both should zoom out for negative deltas, but pinch should be gentler.
    expect(wheel).toBeLessThan(pinch);
  });

  it('positive delta zooms in and negative delta zooms out', () => {
    const base = 4;
    expect(zoomFromWheelDelta(base, 120, 3_600_000, false)).toBeGreaterThan(base);
    expect(zoomFromWheelDelta(base, -120, 3_600_000, false)).toBeLessThan(base);
  });

  it('pinch uses opposite delta sign from wheel direction', () => {
    const base = 4;
    expect(zoomFromWheelDelta(base, 120, 3_600_000, true)).toBeLessThan(base);
    expect(zoomFromWheelDelta(base, -120, 3_600_000, true)).toBeGreaterThan(base);
  });

  it('preserves center focus when computing scroll left after zoom', () => {
    const nextScrollLeft = computeZoomedScrollLeftCentered({
      scrollLeft: 100,
      viewportWidth: 200,
      prevZoom: 1,
      nextZoom: 2,
    });
    expect(nextScrollLeft).toBe(300);
  });
});

describe('SPEEDS', () => {
  it('has exactly 5 values', () => {
    expect(SPEEDS).toHaveLength(5);
  });

  it('contains 1 (normal speed)', () => {
    expect(SPEEDS).toContain(1);
  });

  it('contains 0.5 (slowest)', () => {
    expect(SPEEDS).toContain(0.5);
  });

  it('contains 2 (fastest)', () => {
    expect(SPEEDS).toContain(2);
  });

  it('is sorted in ascending order', () => {
    expect([...SPEEDS]).toEqual([...SPEEDS].sort((a, b) => a - b));
  });
});

describe('formatMsDisplay', () => {
  describe('sub-minute reference — shows S.mmm with no leading zero', () => {
    const ref = 59_999; // 59.999s

    it('formats the duration itself', () => {
      expect(formatMsDisplay(39_876, ref)).toBe('39.876');
    });

    it('formats a position shorter than the duration', () => {
      expect(formatMsDisplay(5_000, ref)).toBe('5.000');
    });

    it('formats zero position', () => {
      expect(formatMsDisplay(0, ref)).toBe('0.000');
    });
  });

  describe('sub-hour reference — shows M:SS.mmm with no leading zero on minutes', () => {
    const ref = 3_599_999; // 59:59.999

    it('formats the duration itself', () => {
      expect(formatMsDisplay(90_500, ref)).toBe('1:30.500');
    });

    it('formats zero minutes (no leading zero)', () => {
      expect(formatMsDisplay(45_000, ref)).toBe('0:45.000');
    });

    it('formats zero position', () => {
      expect(formatMsDisplay(0, ref)).toBe('0:00.000');
    });
  });

  describe('hour+ reference — shows H:MM:SS.mmm with no leading zero on hours', () => {
    const ref = 3_661_001; // 1:01:01.001

    it('formats the duration itself', () => {
      expect(formatMsDisplay(3_661_001, ref)).toBe('1:01:01.001');
    });

    it('formats a position under 1 hour', () => {
      expect(formatMsDisplay(90_000, ref)).toBe('0:01:30.000');
    });

    it('formats zero position', () => {
      expect(formatMsDisplay(0, ref)).toBe('0:00:00.000');
    });
  });

  it('position and duration share the same format for a sub-minute file', () => {
    const dur = 39_876;
    const pos = 12_345;
    const dStr = formatMsDisplay(dur, dur);
    const pStr = formatMsDisplay(pos, dur);
    expect(dStr).toBe('39.876');
    expect(pStr).toBe('12.345');
    expect(pStr.length).toBeLessThanOrEqual(dStr.length);
  });
});
