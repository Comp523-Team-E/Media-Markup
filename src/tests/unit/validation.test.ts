import { describe, it, expect } from 'vitest';
import { validationProblemMarkerIds } from '$lib/validation';
import type { Marker } from '$lib/types';

function marker(id: string, position: number, kind: Marker['kind'] = 'start'): Marker {
  return { id, position, kind };
}

describe('validationProblemMarkerIds', () => {
  it('returns an empty set when error is null', () => {
    const markers = [marker('m1', 1000)];
    expect(validationProblemMarkerIds(markers, null).size).toBe(0);
  });

  it('returns an empty set when error does not match any known pattern', () => {
    const markers = [marker('m1', 1000)];
    expect(validationProblemMarkerIds(markers, 'some unknown error').size).toBe(0);
  });

  describe('"no preceding start" errors', () => {
    it('returns the end marker that has no preceding start', () => {
      const markers = [marker('e1', 1000, 'end')];
      const result = validationProblemMarkerIds(markers, 'end marker has no preceding start');
      expect(result).toEqual(new Set(['e1']));
    });

    it('does not flag an end marker that has a preceding start', () => {
      const markers = [marker('s1', 500, 'start'), marker('e1', 1000, 'end')];
      const result = validationProblemMarkerIds(markers, 'end marker has no preceding start');
      expect(result.size).toBe(0);
    });

    it('handles markers given out of order — sorts by position first', () => {
      const markers = [marker('e1', 1000, 'end'), marker('s1', 500, 'start')];
      const result = validationProblemMarkerIds(markers, 'end marker has no preceding start');
      expect(result.size).toBe(0);
    });

    it('identifies the first orphaned end when a start precedes a different end', () => {
      const markers = [
        marker('e0', 200, 'end'),
        marker('s1', 500, 'start'),
        marker('e1', 1000, 'end'),
      ];
      const result = validationProblemMarkerIds(markers, 'no preceding start marker');
      expect(result).toEqual(new Set(['e0']));
    });

    it('a standalone startEnd counts as an open start so a following end is valid', () => {
      const markers = [marker('b1', 500, 'startEnd'), marker('e1', 1000, 'end')];
      const result = validationProblemMarkerIds(markers, 'end marker has no preceding start');
      expect(result.size).toBe(0);
    });

    it('identifies the orphaned end after a startEnd+end pair has consumed all open starts', () => {
      const markers = [
        marker('b1', 500, 'startEnd'),
        marker('e1', 1000, 'end'),
        marker('e2', 1500, 'end'),
      ];
      const result = validationProblemMarkerIds(markers, 'end marker has no preceding start');
      expect(result).toEqual(new Set(['e2']));
    });
  });

  describe('"unmatched start" errors', () => {
    it('finds the unmatched start by position from the error message', () => {
      const markers = [marker('s1', 3000, 'start')];
      const result = validationProblemMarkerIds(markers, 'unmatched start at position 3000 ms');
      expect(result).toEqual(new Set(['s1']));
    });

    it('finds an unmatched startEnd marker by position', () => {
      const markers = [marker('b1', 5000, 'startEnd')];
      const result = validationProblemMarkerIds(markers, 'unmatched start at position 5000 ms');
      expect(result).toEqual(new Set(['b1']));
    });

    it('falls back to the last start marker when no position is in the error', () => {
      const markers = [marker('s1', 1000, 'start'), marker('s2', 3000, 'start')];
      const result = validationProblemMarkerIds(markers, 'unmatched start marker found');
      expect(result).toEqual(new Set(['s2']));
    });

    it('falls back to the last startEnd marker when no position in the error', () => {
      const markers = [marker('b1', 3000, 'startEnd')];
      const result = validationProblemMarkerIds(markers, 'unmatched start marker found');
      expect(result).toEqual(new Set(['b1']));
    });

    it('returns empty set when no start or startEnd exists for fallback', () => {
      const markers = [marker('e1', 1000, 'end')];
      const result = validationProblemMarkerIds(markers, 'unmatched start marker found');
      expect(result.size).toBe(0);
    });

    it('ignores end markers when searching by position', () => {
      const markers = [marker('e1', 3000, 'end')];
      const result = validationProblemMarkerIds(markers, 'unmatched start at position 3000 ms');
      expect(result.size).toBe(0);
    });
  });
});
