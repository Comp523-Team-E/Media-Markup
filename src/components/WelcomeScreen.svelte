<script lang="ts">
  import { appState } from '$lib/state.svelte';

  let { onOpenFile }: { onOpenFile: () => void } = $props();
</script>

<div class="welcome">
  <div class="brand">
    <span class="brand-name">Audio Ninja</span>
    <span class="brand-sub">Precision audio/video segmentation tool</span>
  </div>
  <div class="upload-card">
    <div class="upload-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    </div>
    <h2>Open a media file to begin</h2>
    <p class="upload-formats">Supported formats: MP4, MP3, WAV, FLAC, OGG, AAC</p>
    {#if appState.error}
      <p class="error-text">{appState.error}</p>
    {/if}
    <button class="btn-primary" onclick={onOpenFile}>Choose File</button>
  </div>
</div>

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 32px;
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .brand-name {
    font-size: 22px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .brand-sub {
    font-size: 12px;
    color: #8b949e;
  }

  .upload-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 64px;
    background: #161b22;
    border: 1.5px dashed #30363d;
    border-radius: 16px;
  }

  .upload-icon {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1d3461;
    border-radius: 50%;
    color: #3b82f6;
  }

  .upload-icon svg {
    width: 28px;
    height: 28px;
  }

  .upload-card h2 {
    font-size: 18px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .upload-formats {
    font-size: 12px;
    color: #8b949e;
  }

  .error-text {
    color: #f87171;
    font-size: 12px;
    max-width: 320px;
    text-align: center;
  }

  .btn-primary {
    padding: 8px 24px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover { background: #1d4ed8; }
</style>
