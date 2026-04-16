import { describe, it, expect } from 'vitest';
import { formatMs, formatMsDisplay, kindLabel, SPEEDS, ZOOM_LEVELS, parseTimeMs } from '$lib/utils';

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

describe('ZOOM_LEVELS', () => {
  it('starts at 1 (no zoom)', () => {
    expect(ZOOM_LEVELS[0]).toBe(1);
  });

  it('ends at 16 (maximum zoom)', () => {
    expect(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]).toBe(16);
  });

  it('has at least 3 steps', () => {
    expect(ZOOM_LEVELS.length).toBeGreaterThanOrEqual(3);
  });

  it('is sorted in strictly ascending order', () => {
    for (let i = 1; i < ZOOM_LEVELS.length; i++) {
      expect(ZOOM_LEVELS[i]).toBeGreaterThan(ZOOM_LEVELS[i - 1]);
    }
  });

  it('contains only positive integers', () => {
    for (const level of ZOOM_LEVELS) {
      expect(level).toBeGreaterThan(0);
      expect(Number.isInteger(level)).toBe(true);
    }
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
