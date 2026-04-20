import type { Marker } from './types';

export function validationProblemMarkerIds(markers: Marker[], error: string | null): Set<string> {
  if (!error) return new Set();

  const sorted = [...markers].sort((a, b) => a.position - b.position);
  const message = error.toLowerCase();

  if (message.includes('no preceding start')) {
    // Simulate the stack to find the first end that hits an empty stack.
    // startEnd with nothing open increments the count (opens a new pending start);
    // startEnd with something open is net-zero (closes one, opens one).
    let count = 0;
    for (const marker of sorted) {
      if (marker.kind === 'start') {
        count++;
      } else if (marker.kind === 'startEnd') {
        if (count === 0) count++;
      } else if (marker.kind === 'end') {
        if (count === 0) return new Set([marker.id]);
        count--;
      }
    }
  }

  if (message.includes('unmatched start')) {
    const position = error.match(/position\s+(\d+)\s+ms/i)?.[1];
    const unmatched = position
      ? sorted.find(marker => (marker.kind === 'start' || marker.kind === 'startEnd') && marker.position === Number(position))
      : [...sorted].reverse().find(marker => marker.kind === 'start' || marker.kind === 'startEnd');
    if (unmatched) return new Set([unmatched.id]);
  }

  return new Set();
}
