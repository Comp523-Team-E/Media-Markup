# Building the App

## Prerequisites

- **Node.js** (v18+) and **npm** — [nodejs.org](https://nodejs.org)
- **Rust** (stable) — install via [rustup.rs](https://rustup.rs)
- **Tauri system dependencies** — follow the [Tauri v2 prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your OS (Linux requires several system libraries; macOS and Windows are covered by the tools above)
- **Linux only:** `curl` and `tar` — used by the ffmpeg download script (usually preinstalled)

## Building

After checking that the prerequisites are properly installed, cd into the project's directory and run the following commands to build and run:

```bash
    npm install
    # Build and run for development
    npm run tauri dev  
    # OR
    # Build and run for production
    npm run tuari build 
```

`npm run tauri dev` automatically ensures the required ffmpeg sidecar exists before Tauri starts. You can still run `npm run download-ffmpeg` manually if you need to refresh it.
