const BADGE_STYLE =
  "background:#7c5cff;color:#fff;border-radius:4px;padding:1px 6px;font-weight:600";

export class Logger {
  readonly info: typeof console.info;
  readonly warn: typeof console.warn;
  readonly error: typeof console.error;

  constructor(name: string) {
    const badge = [`%cInflux%c [${name}]`, BADGE_STYLE, ""];
    this.info = console.info.bind(console, ...badge);
    this.warn = console.warn.bind(console, ...badge);
    this.error = console.error.bind(console, ...badge);
  }
}
