import { describe, it, expect } from 'vitest';
import { formatMs, kindLabel, SPEEDS, parseTimeMs } from '$lib/utils';

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
