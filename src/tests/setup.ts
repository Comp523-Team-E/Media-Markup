import '@testing-library/jest-dom';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';

// Polyfill requestAnimationFrame for jsdom
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16) as unknown as number;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

// Install a no-op IPC handler before each test so any invoke() that isn't
// overridden per-test doesn't throw an unhandled rejection.
beforeEach(() => {
  mockIPC(() => undefined);
});

afterEach(() => {
  clearMocks();
});
