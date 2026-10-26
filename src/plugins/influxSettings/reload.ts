/**
 * Reloading an Electron page with location.reload() can race Fluxer's
 * desktop-runtime-config IPC gate: Fluxer refuses resolve() while the main
 * frame is still loading. Use Fluxer's existing trusted native relaunch path
 * instead; never bypass the renderer ownership/security checks.
 */
export interface PluginReloadOptions {
  isDesktop: boolean;
  persistSettings(): void;
  nativeRelaunch?: () => Promise<void>;
  browserReload(): void;
}

export async function reloadAfterPluginChange(options: PluginReloadOptions): Promise<void> {
  // Influx batches settings writes. A process restart can otherwise happen
  // before the enabled flags reach localStorage.
  options.persistSettings();

  if (options.isDesktop) {
    if (!options.nativeRelaunch) {
      throw new Error(
        "Fluxer's desktop restart bridge is unavailable. Quit and reopen Fluxer manually.",
      );
    }
    await options.nativeRelaunch();
    return;
  }

  // The browser extension has no privileged main-frame IPC ownership gate.
  options.browserReload();
}
