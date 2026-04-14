import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';
import { appState } from '$lib/state.svelte';
import { importCsv } from '$lib/actions';
import { resetAppState } from '../helpers/reset-state';
import type { Marker, Segment } from '$lib/types';

function marker(id: string, position: number, kind: Marker['kind'] = 'start'): Marker {
  return { id, position, kind };
}

function segment(startMs: number, endMs: number, title: string): Segment {
  return { startMs, endMs, title };
}

beforeEach(() => {
  resetAppState();
});

describe('importCsv', () => {
  it('sets appState.markers sorted by position', async () => {
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'import_csv') return [marker('m2', 5000, 'end'), marker('m1', 0, 'start')];
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await importCsv();
    expect(appState.markers[0].id).toBe('m1');
    expect(appState.markers[1].id).toBe('m2');
  });

  it('calls validate_markers after import', async () => {
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'import_csv') return [marker('m1', 0, 'start'), marker('m2', 1000, 'end')];
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await importCsv();
    expect(handler).toHaveBeenCalledWith('validate_markers', expect.anything());
  });

  it('sets appState.segments from validate_markers result', async () => {
    const segs = [segment(0, 1000, 'Imported')];
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'import_csv') return [marker('m1', 0, 'start'), marker('m2', 1000, 'end')];
      if (cmd === 'validate_markers') return segs;
      return undefined;
    });
    mockIPC(handler);
    await importCsv();
    expect(appState.segments).toEqual(segs);
  });

  it('resets selectedMarkerId to null', async () => {
    appState.selectedMarkerId = 'old';
    mockIPC((cmd: string) => {
      if (cmd === 'import_csv') return [];
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    await importCsv();
    expect(appState.selectedMarkerId).toBeNull();
  });

  it('resets editingMarkerId to null', async () => {
    appState.editingMarkerId = 'old';
    mockIPC((cmd: string) => {
      if (cmd === 'import_csv') return [];
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    await importCsv();
    expect(appState.editingMarkerId).toBeNull();
  });

  it('resets editingPositionMs to 0', async () => {
    appState.editingPositionMs = 999;
    mockIPC((cmd: string) => {
      if (cmd === 'import_csv') return [];
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    await importCsv();
    expect(appState.editingPositionMs).toBe(0);
  });

  it('resets unkindedMarkers to empty set', async () => {
    appState.unkindedMarkers = new Set(['old']);
    mockIPC((cmd: string) => {
      if (cmd === 'import_csv') return [];
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    await importCsv();
    expect(appState.unkindedMarkers.size).toBe(0);
  });

  it('sets renameInputs only for non-end markers', async () => {
    const handler = vi.fn((cmd: string) => {
      if (cmd === 'import_csv') return [
        marker('s1', 0, 'start'),
        marker('e1', 1000, 'end'),
        marker('b1', 2000, 'startEnd'),
      ];
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    mockIPC(handler);
    await importCsv();
    expect(appState.renameInputs['s1']).toBe('');
    expect(appState.renameInputs['b1']).toBe('');
    expect(appState.renameInputs['e1']).toBeUndefined();
  });

  it('does not set appState.error when dialog is cancelled', async () => {
    mockIPC(() => { throw 'Dialog cancelled'; });
    await importCsv();
    expect(appState.error).toBeNull();
  });

  it('sets appState.error on other failures', async () => {
    mockIPC(() => { throw new Error('parse error'); });
    await importCsv();
    expect(appState.error).toMatch('parse error');
  });

  it('clears appState.error before invoking', async () => {
    appState.error = 'old error';
    mockIPC((cmd: string) => {
      if (cmd === 'import_csv') return [];
      if (cmd === 'validate_markers') return [];
      return undefined;
    });
    await importCsv();
    expect(appState.error).toBeNull();
  });
});
