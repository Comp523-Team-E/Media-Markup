<script lang="ts">
  import { appState } from '$lib/state.svelte';

  function dismiss() {
    appState.error = null;
  }
</script>

{#if appState.error}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="backdrop" role="presentation" onclick={dismiss}></div>
  <div class="alert" role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
    <div class="alert-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <div class="alert-body">
      <p id="alert-title" class="alert-title">Error</p>
      <p class="alert-message">{appState.error}</p>
    </div>
    <button class="btn-dismiss" onclick={dismiss}>OK</button>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 100;
  }

  .alert {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 101;
    background: #161b22;
    border: 1px solid #f87171;
    border-radius: 10px;
    padding: 20px 24px;
    min-width: 320px;
    max-width: 520px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }

  .alert-icon {
    color: #f87171;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .alert-body {
    flex: 1;
    min-width: 0;
  }

  .alert-title {
    font-size: 14px;
    font-weight: 700;
    color: #f87171;
    margin-bottom: 6px;
  }

  .alert-message {
    font-size: 13px;
    color: #e2e8f0;
    line-height: 1.5;
    word-break: break-word;
  }

  .btn-dismiss {
    flex-shrink: 0;
    padding: 6px 18px;
    background: #1e2a3a;
    color: #e2e8f0;
    border: 1px solid #30363d;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    margin-top: 2px;
  }

  .btn-dismiss:hover {
    background: #263548;
    border-color: #4d6a8a;
  }
</style>
