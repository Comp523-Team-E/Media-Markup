import { describe, it, expect } from 'vitest';
import { formatMs, kindLabel, SPEEDS } from '$lib/utils';

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
