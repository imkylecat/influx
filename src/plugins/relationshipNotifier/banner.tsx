import { React } from "@webpack/common";
import { getPluginData, saveSettings } from "@api/Settings";
import { find } from "@webpack/finders";
import type { ComponentType, ReactNode } from "react";

const PLUGIN = "RelationshipNotifier";
const MAX_NOTICES = 50;
const BANNER_TONE = "brand";

export interface Notice {
  message: string;
  at: number;
}

interface NoticeList {
  length: number;
  [index: number]: Notice;
  push(...notices: Notice[]): number;
  splice(start: number, count?: number): Notice[];
  slice(): Notice[];
}

// Fluxer's banner building blocks, lifted out of its nagbar module by the container patch.
export interface NagbarParts {
  Nagbar: ComponentType<any> | null;
  Content: ComponentType<any> | null;
  Button: ComponentType<any> | null;
  tones: Record<string, { backgroundColor: string; textColor: string }> | null;
  isMobile: boolean;
}

interface NagbarItem {
  type: unknown;
  influxBanner?: ReactNode;
}

let notices: NoticeList | undefined;
// Whether the nagbar patch found all of Fluxer's banner parts. Without them, notices go to toasts.
let nagbarFound = false;

export const canShowBanner = (): boolean => nagbarFound;

function savedNotices(): Notice[] {
  const saved = getPluginData(PLUGIN).notices;
  return Array.isArray(saved) ? saved.filter((n) => typeof n?.message === "string") : [];
}

// A MobX array, when Fluxer's MobX can be found, so the banner shows and hides as notices change.
function getNotices(): NoticeList {
  if (notices) return notices;
  const observable = find(
    (v) =>
      typeof v === "function" &&
      typeof v.box === "function" &&
      typeof v.array === "function" &&
      typeof v.object === "function",
  );
  const initial = savedNotices();
  notices = observable ? observable.array(initial, { deep: false }) : initial;
  return notices!;
}

function persist(): void {
  getPluginData(PLUGIN).notices = getNotices().slice();
  saveSettings();
}

export function addNotice(message: string): void {
  const list = getNotices();
  list.push({ message, at: Date.now() });
  if (list.length > MAX_NOTICES) list.splice(0, list.length - MAX_NOTICES);
  persist();
}

function dismissLatest(): void {
  const list = getNotices();
  if (list.length) list.splice(list.length - 1, 1);
  persist();
}

export function dismissAll(): void {
  const list = getNotices();
  list.splice(0, list.length);
  persist();
}

export function hasNotices(): boolean {
  return getNotices().length > 0;
}

function formatTime(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString()} ${time}`;
}

function Banner({ parts }: { parts: NagbarParts }) {
  const list = getNotices();
  const latest = list[list.length - 1];
  const more = list.length - 1;
  const { Nagbar, Content, Button, tones, isMobile } = parts;
  if (!Nagbar || !Content || !Button) return null;
  const message = `${latest.message} (${formatTime(latest.at)})${more > 0 ? ` +${more} more` : ""}`;

  const tone = tones?.[BANNER_TONE] ?? {
    backgroundColor: "var(--brand-primary)",
    textColor: "var(--text-on-brand-primary)",
  };
  return (
    <Nagbar
      isMobile={isMobile}
      backgroundColor={tone.backgroundColor}
      textColor={tone.textColor}
      dismissible
      onDismiss={dismissAll}
    >
      <Content
        isMobile={isMobile}
        message={message}
        onDismiss={dismissAll}
        actions={
          more > 0 ? (
            <>
              <Button isMobile={isMobile} onClick={dismissLatest}>
                Next
              </Button>
              <Button isMobile={isMobile} onClick={dismissAll}>
                Dismiss all
              </Button>
            </>
          ) : (
            <Button isMobile={isMobile} onClick={dismissAll}>
              Dismiss
            </Button>
          )
        }
      />
    </Nagbar>
  );
}

export function withBanner<T extends NagbarItem>(items: T[], parts: NagbarParts): T[] {
  try {
    if (!nagbarFound || !hasNotices()) return items;
    const banner = { type: "influx_relationship_notifier" } as unknown as T;
    banner.influxBanner = <Banner key="influx-relationship-notifier" parts={parts} />;
    return [banner, ...items];
  } catch (error) {
    console.error("[Influx] RelationshipNotifier failed to add its banner", error);
    return items;
  }
}

const ID = String.raw`[\w$]+`;
const NAGBAR = new RegExp(
  String.raw`\(0,${ID}\.jsx\)\((${ID}),\{isMobile:${ID},backgroundColor:(${ID}\.${ID})\[${ID}\.${ID}\.[A-Z_]+\]\.backgroundColor`,
);
const CONTENT = new RegExp(
  String.raw`children:\(0,${ID}\.jsx\)\((${ID}),\{isMobile:${ID},(?:onDismiss:[^,]+,)?message:`,
);
const BUTTON = new RegExp(
  String.raw`\(0,${ID}\.jsx\)\((${ID}),\{isMobile:${ID},onClick:[^{}]{0,160}?"data-flx":"[\w.-]*nagbar[\w.-]*"`,
);

// Builds the object literal that hands Fluxer's nagbar parts to withBanner at render time.
export function nagbarPartsSource(moduleCode: string, isMobileExpr: string): string {
  const nagbar = NAGBAR.exec(moduleCode);
  const content = CONTENT.exec(moduleCode);
  const button = BUTTON.exec(moduleCode);
  nagbarFound = Boolean(nagbar && content && button);
  return (
    `{Nagbar:${nagbar?.[1] ?? "null"},tones:${nagbar?.[2] ?? "null"},` +
    `Content:${content?.[1] ?? "null"},Button:${button?.[1] ?? "null"},isMobile:!!(${isMobileExpr})}`
  );
}
