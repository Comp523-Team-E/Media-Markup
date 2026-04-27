#!/usr/bin/env bash
# Ensure ffmpeg binaries exist in src-tauri/binaries/ for use as Tauri sidecars.
#
# Usage:
#   ./scripts/download-ffmpeg.sh                              # ensure the current host platform binary exists
#   ./scripts/download-ffmpeg.sh --all                        # download/refresh all supported platform binaries (CI)
#   ./scripts/download-ffmpeg.sh --target <RUST_TRIPLE>       # download for a specific target triple
#
# Supported target triples:
#   aarch64-apple-darwin       (macOS Apple Silicon)
#   x86_64-apple-darwin        (macOS Intel)
#   x86_64-unknown-linux-gnu   (Linux x64)
#   aarch64-unknown-linux-gnu  (Linux ARM64)
#   x86_64-pc-windows-msvc     (Windows x64, requires bash e.g. Git Bash / WSL)
#   aarch64-pc-windows-msvc    (Windows ARM64, requires bash e.g. Git Bash / WSL)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARIES_DIR="$SCRIPT_DIR/../src-tauri/binaries"
mkdir -p "$BINARIES_DIR"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[download-ffmpeg] $*"; }

sidecar_ready() {
    local path="$1"

    if [[ -f "$path" ]]; then
        if [[ ! -x "$path" ]]; then
            chmod +x "$path"
        fi

        log "Using existing ffmpeg sidecar: $path"
        return 0
    fi

    return 1
}

require_cmd() {
    if ! command -v "$1" &>/dev/null; then
        echo "Error: '$1' is required but not found on PATH." >&2
        exit 1
    fi
}

# Download macOS binary from ffmpeg-static. Do not copy the Homebrew binary:
# Homebrew's ffmpeg is dynamically linked against Homebrew dylibs, which are
# not present inside the packaged .app on end-user machines.
download_macos() {
    local triple="$1"   # aarch64-apple-darwin or x86_64-apple-darwin
    local dest="$BINARIES_DIR/ffmpeg-${triple}"

    if [[ -f "$dest" ]]; then
        if command -v otool &>/dev/null && otool -L "$dest" 2>/dev/null | grep -Eq '/(opt/homebrew|usr/local)/(Cellar|opt)/'; then
            log "Replacing dynamically linked Homebrew ffmpeg sidecar: $dest"
        elif sidecar_ready "$dest"; then
            return 0
        fi
    fi

    require_cmd curl
    require_cmd gunzip

    local arch
    case "$triple" in
        aarch64-apple-darwin) arch="arm64" ;;
        x86_64-apple-darwin)  arch="x64" ;;
        *) echo "Unsupported macOS target: $triple" >&2; exit 1 ;;
    esac

    local release="b6.1.1"
    local asset_url="https://github.com/eugeneware/ffmpeg-static/releases/download/${release}/ffmpeg-darwin-${arch}.gz"

    log "Downloading static macOS ffmpeg sidecar for $triple ..."
    local tmpdir
    tmpdir="$(mktemp -d)"
    trap "rm -rf '$tmpdir'" EXIT

    curl -fL -o "$tmpdir/ffmpeg.gz" "$asset_url"
    if [[ -f "$dest" ]]; then
        chmod u+w "$dest"
    fi
    gunzip -c "$tmpdir/ffmpeg.gz" > "$dest"
    chmod +x "$dest"
    log "Installed: $dest"
}

# Download Linux x64 binary from BtbN/FFmpeg-Builds (GPL static build).
download_linux_x64() {
    local triple="x86_64-unknown-linux-gnu"
    local dest="$BINARIES_DIR/ffmpeg-${triple}"

    if sidecar_ready "$dest"; then
        return 0
    fi

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
    tar -xJf "$tmpdir/ffmpeg.tar.xz" -C "$tmpdir"
    find "$tmpdir" -name "ffmpeg" -type f -exec cp {} "$dest" \;

    chmod +x "$dest"
    log "Installed: $dest"
}

# Download Linux ARM64 binary from BtbN/FFmpeg-Builds (GPL static build).
download_linux_arm64() {
    local triple="aarch64-unknown-linux-gnu"
    local dest="$BINARIES_DIR/ffmpeg-${triple}"

    if sidecar_ready "$dest"; then
        return 0
    fi

    require_cmd curl
    require_cmd tar

    log "Fetching latest BtbN release info..."
    local asset_url
    asset_url="$(
        curl -fsSL "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest" \
        | grep -o '"browser_download_url": *"[^"]*linuxarm64-gpl[^"]*\.tar\.xz"' \
        | grep -v "shared" \
        | head -1 \
        | sed 's/.*"\(https[^"]*\)".*/\1/'
    )"

    if [[ -z "$asset_url" ]]; then
        echo "Error: Could not determine Linux ARM64 ffmpeg download URL from BtbN releases." >&2
        exit 1
    fi

    log "Downloading $asset_url ..."
    local tmpdir
    tmpdir="$(mktemp -d)"
    trap "rm -rf '$tmpdir'" EXIT

    curl -fsSL -o "$tmpdir/ffmpeg.tar.xz" "$asset_url"
    tar -xJf "$tmpdir/ffmpeg.tar.xz" -C "$tmpdir"
    find "$tmpdir" -name "ffmpeg" -type f -exec cp {} "$dest" \;

    chmod +x "$dest"
    log "Installed: $dest"
}

# Download Windows x64 binary from BtbN/FFmpeg-Builds (GPL static build).
download_windows_x64() {
    local triple="x86_64-pc-windows-msvc"
    local dest="$BINARIES_DIR/ffmpeg-${triple}.exe"

    if sidecar_ready "$dest"; then
        return 0
    fi

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

# Download Windows ARM64 binary from BtbN/FFmpeg-Builds (GPL static build).
download_windows_arm64() {
    local triple="aarch64-pc-windows-msvc"
    local dest="$BINARIES_DIR/ffmpeg-${triple}.exe"

    if sidecar_ready "$dest"; then
        return 0
    fi

    require_cmd curl
    require_cmd unzip

    log "Fetching latest BtbN release info..."
    local asset_url
    asset_url="$(
        curl -fsSL "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest" \
        | grep -o '"browser_download_url": *"[^"]*winarm64-gpl[^"]*\.zip"' \
        | grep -v "shared" \
        | head -1 \
        | sed 's/.*"\(https[^"]*\)".*/\1/'
    )"

    if [[ -z "$asset_url" ]]; then
        echo "Error: Could not determine Windows ARM64 ffmpeg download URL from BtbN releases." >&2
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
                x86_64)  download_linux_x64 ;;
                aarch64) download_linux_arm64 ;;
                *) echo "Unsupported Linux arch: $arch (only x86_64 and aarch64 supported)" >&2; exit 1 ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            case "$arch" in
                x86_64)  download_windows_x64 ;;
                aarch64) download_windows_arm64 ;;
                *) echo "Unsupported Windows arch: $arch (only x86_64 and aarch64 supported)" >&2; exit 1 ;;
            esac
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

download_for_target() {
    local triple="$1"
    case "$triple" in
        aarch64-apple-darwin)       download_macos "$triple" ;;
        x86_64-apple-darwin)        download_macos "$triple" ;;
        x86_64-unknown-linux-gnu)   download_linux_x64 ;;
        aarch64-unknown-linux-gnu)  download_linux_arm64 ;;
        x86_64-pc-windows-msvc)     download_windows_x64 ;;
        aarch64-pc-windows-msvc)    download_windows_arm64 ;;
        *) echo "Error: Unsupported target triple: $triple" >&2; exit 1 ;;
    esac
}

case "${1:-}" in
    --all)
        log "Downloading for all platforms..."
        download_macos "aarch64-apple-darwin"
        download_macos "x86_64-apple-darwin"
        download_linux_x64
        download_linux_arm64
        download_windows_x64
        download_windows_arm64
        log "Done. All binaries written to $BINARIES_DIR/"
        ;;
    --target)
        if [[ -z "${2:-}" ]]; then
            echo "Usage: $0 --target <RUST_TARGET_TRIPLE>" >&2
            exit 1
        fi
        download_for_target "$2"
        log "Done."
        ;;
    "")
        detect_and_download_host
        log "Done."
        ;;
    *)
        echo "Usage: $0 [--all | --target <RUST_TARGET_TRIPLE>]" >&2
        exit 1
        ;;
esac
