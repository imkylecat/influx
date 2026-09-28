export type UpdateCheckResult =
  | { ok: true; latest: string; available: boolean; pendingRestart: string | null; url: string }
  | { ok: false; error: string };

export type UpdateInstallResult = { ok: true; version: string } | { ok: false; error: string };

export interface InfluxNative {
  updater: {
    check(): Promise<UpdateCheckResult>;
    install(): Promise<UpdateInstallResult>;
    restart(): Promise<void>;
  };
}
