#!/usr/bin/env bash
# Download static ffmpeg binaries into src-tauri/binaries/ for use as a Tauri sidecar.
#
# Usage:
#   ./scripts/download-ffmpeg.sh          # download for the current host platform
#   ./scripts/download-ffmpeg.sh --all    # download for all supported platforms (CI)
#
# Supported target triples:
#   aarch64-apple-darwin       (macOS Apple Silicon)
#   x86_64-apple-darwin        (macOS Intel)
#   x86_64-unknown-linux-gnu   (Linux x64)
#   x86_64-pc-windows-msvc     (Windows x64, requires bash e.g. Git Bash / WSL)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARIES_DIR="$SCRIPT_DIR/../src-tauri/binaries"
mkdir -p "$BINARIES_DIR"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[download-ffmpeg] $*"; }

require_cmd() {
    if ! command -v "$1" &>/dev/null; then
        echo "Error: '$1' is required but not found on PATH." >&2
        exit 1
    fi
}

# Download macOS binary via Homebrew (handles both arm64 and x86_64 natively).
download_macos() {
    local triple="$1"   # aarch64-apple-darwin or x86_64-apple-darwin
    local dest="$BINARIES_DIR/ffmpeg-${triple}"

    log "Downloading ffmpeg for $triple via Homebrew..."

    if ! command -v brew &>/dev/null; then
        echo "Error: Homebrew not found. Install it from https://brew.sh then re-run." >&2
        echo "  Alternatively, install ffmpeg manually and place the binary at:" >&2
        echo "    $dest" >&2
        exit 1
    fi

    if ! brew list ffmpeg &>/dev/null 2>&1; then
        log "ffmpeg not installed — running 'brew install ffmpeg'..."
        brew install ffmpeg
    fi

    local brew_ffmpeg
    brew_ffmpeg="$(brew --prefix ffmpeg)/bin/ffmpeg"
    if [[ ! -f "$brew_ffmpeg" ]]; then
        echo "Error: Could not find ffmpeg binary at expected Homebrew path: $brew_ffmpeg" >&2
        exit 1
    fi

    cp "$brew_ffmpeg" "$dest"
    chmod +x "$dest"
    log "Installed: $dest"
}

# Download Linux x64 binary from BtbN/FFmpeg-Builds (GPL static build).
download_linux_x64() {
    local triple="x86_64-unknown-linux-gnu"
    local dest="$BINARIES_DIR/ffmpeg-${triple}"

    require_cmd curl
    require_cmd tar

    log "Fetching latest BtbN release info..."
    local asset_url
    asset_url="$(
        curl -fsSL "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest" \
        | grep -o '"browser_download_url": *"[^"]*linux64-gpl[^"]*\.tar\.xz"' \
        | grep -v "shared" \
        | head -1 \
        | sed 's/.*"\(https[^"]*\)".*/\1/'
    )"

    if [[ -z "$asset_url" ]]; then
        echo "Error: Could not determine Linux64 ffmpeg download URL from BtbN releases." >&2
        exit 1
    fi

    log "Downloading $asset_url ..."
    local tmpdir
    tmpdir="$(mktemp -d)"
    trap "rm -rf '$tmpdir'" EXIT

    curl -fsSL -o "$tmpdir/ffmpeg.tar.xz" "$asset_url"
    tar -xJf "$tmpdir/ffmpeg.tar.xz" -C "$tmpdir" --wildcards "*/bin/ffmpeg" --strip-components=2

    cp "$tmpdir/ffmpeg" "$dest"
    chmod +x "$dest"
    log "Installed: $dest"
}

# Download Windows x64 binary from BtbN/FFmpeg-Builds (GPL static build).
download_windows_x64() {
    local triple="x86_64-pc-windows-msvc"
    local dest="$BINARIES_DIR/ffmpeg-${triple}.exe"

    require_cmd curl
    require_cmd unzip

    log "Fetching latest BtbN release info..."
    local asset_url
    asset_url="$(
        curl -fsSL "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest" \
        | grep -o '"browser_download_url": *"[^"]*win64-gpl[^"]*\.zip"' \
        | grep -v "shared" \
        | head -1 \
        | sed 's/.*"\(https[^"]*\)".*/\1/'
    )"

    if [[ -z "$asset_url" ]]; then
        echo "Error: Could not determine Win64 ffmpeg download URL from BtbN releases." >&2
        exit 1
    fi

    log "Downloading $asset_url ..."
    local tmpdir
    tmpdir="$(mktemp -d)"
    trap "rm -rf '$tmpdir'" EXIT

    curl -fsSL -o "$tmpdir/ffmpeg.zip" "$asset_url"
    unzip -q "$tmpdir/ffmpeg.zip" "*/bin/ffmpeg.exe" -d "$tmpdir"
    find "$tmpdir" -name "ffmpeg.exe" -exec cp {} "$dest" \;

    log "Installed: $dest"
}

# ---------------------------------------------------------------------------
# Detect host and dispatch
# ---------------------------------------------------------------------------

detect_and_download_host() {
    local os arch triple
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Darwin)
            case "$arch" in
                arm64)  triple="aarch64-apple-darwin" ;;
                x86_64) triple="x86_64-apple-darwin" ;;
                *) echo "Unsupported macOS arch: $arch" >&2; exit 1 ;;
            esac
            download_macos "$triple"
            ;;
        Linux)
            case "$arch" in
                x86_64) download_linux_x64 ;;
                *) echo "Unsupported Linux arch: $arch (only x86_64 supported)" >&2; exit 1 ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            download_windows_x64
            ;;
        *)
            echo "Unsupported OS: $os" >&2
            exit 1
            ;;
    esac
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

case "${1:-}" in
    --all)
        log "Downloading for all platforms..."
        download_macos "aarch64-apple-darwin"
        download_macos "x86_64-apple-darwin"
        download_linux_x64
        download_windows_x64
        log "Done. All binaries written to $BINARIES_DIR/"
        ;;
    "")
        detect_and_download_host
        log "Done."
        ;;
    *)
        echo "Usage: $0 [--all]" >&2
        exit 1
        ;;
esac
