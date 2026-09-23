export type UpdateCheckResult =
  | {
      ok: true;
      current: string;
      latest: string;
      available: boolean;
      pendingRestart: string | null;
      url: string;
      notes: string;
    }
  | { ok: false; error: string };

export type UpdateInstallResult = { ok: true; version: string } | { ok: false; error: string };

export interface InfluxNative {
  updater: {
    check(): Promise<UpdateCheckResult>;
    install(): Promise<UpdateInstallResult>;
    restart(): Promise<void>;
  };
}
