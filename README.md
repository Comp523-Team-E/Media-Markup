<div align="center">
  <img src="icon.png" alt="Audio Ninja" width="120" />
  <h1>Audio Ninja</h1>
  <p><em>Precision audio segmentation for desktop</em></p>
</div>

---

Audio Ninja is a desktop app for precision audio segmentation. Load any media file (MP4, MP3, WAV, FLAC, OGG, or AAC), place markers on an interactive waveform, and define named segments with exact timestamps — then export your annotations for downstream use. Built with Tauri, Svelte, and Rust, it runs natively on macOS and Windows with no browser required.

User and developer documentation for the app is available in the [docs](docs/index.md).

## Quick Start Guide

### For Users

1. Go to the [Audio Ninja GitHub Releases page](https://github.com/Comp523-Team-E/audio-ninja/releases).
2. Click on Tags and download the installer for your operating system:
   - **macOS:** download the `.dmg` file.
   - **Windows:** download the `.msi` file.
   - **Linux:** download the `.deb` file.
3. Open the downloaded installer and install Audio Ninja like a normal desktop application.
4. Launch Audio Ninja, import a supported media file, add markers and segments, then export your annotations.

For walkthroughs of the application workflow, see the [user documentation](docs/user-documentation/index.md).

### For Developers

Audio Ninja is a [Tauri v2](https://v2.tauri.app/) desktop application with a [SvelteKit](https://svelte.dev/docs/kit/introduction) frontend and a [Rust](https://www.rust-lang.org/) backend.

Install the required tools first:

- [Node.js](https://nodejs.org/) v18 or newer, which includes `npm`
- [Rust](https://www.rust-lang.org/tools/install), installed through `rustup`
- [Tauri v2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system
- **Windows only:** [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), as described in the Tauri prerequisites

Then clone and run the app:

```bash
git clone https://github.com/Comp523-Team-E/audio-ninja.git
cd audio-ninja
npm install
npm run tauri dev
```

The Tauri development command starts the Svelte frontend, builds the Rust backend, and opens the desktop app. It also runs the FFmpeg sidecar setup script automatically. If you need to refresh FFmpeg manually, run:

```bash
npm run download-ffmpeg
```

Useful development commands:

```bash
npm run check          # Type-check the Svelte/TypeScript frontend
npm test               # Run frontend unit tests with Vitest
npm run coverage       # Generate frontend test coverage
npm run tauri -- build # Build distributable desktop packages
```

Rust backend tests are run from the Tauri project directory:

```bash
cd src-tauri
cargo test
```

For more detailed setup, build, and testing notes, see the [developer documentation](docs/developer-documentation/index.md), especially [Building](docs/developer-documentation/building.md) and [Testing](docs/developer-documentation/testing.md).
