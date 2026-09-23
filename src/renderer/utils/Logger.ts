const BADGE_STYLE =
  "background:#7c5cff;color:#fff;border-radius:4px;padding:1px 6px;font-weight:600";

export class Logger {
  constructor(private readonly name: string) {}

  private print(level: "log" | "info" | "warn" | "error" | "debug", args: unknown[]): void {
    console[level](`%cInflux%c [${this.name}]`, BADGE_STYLE, "", ...args);
  }

  log(...args: unknown[]): void {
    this.print("log", args);
  }

  info(...args: unknown[]): void {
    this.print("info", args);
  }

  warn(...args: unknown[]): void {
    this.print("warn", args);
  }

  error(...args: unknown[]): void {
    this.print("error", args);
  }

  debug(...args: unknown[]): void {
    this.print("debug", args);
  }
}
