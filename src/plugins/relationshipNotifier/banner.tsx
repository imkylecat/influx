import { getPluginData, saveSettings } from "@api/Settings";
import { Components, found, observable, React } from "@webpack/common";
import type { ReactNode } from "react";

const MAXIMUM_NOTICES = 50;

interface Notice {
  message: string;
  at: number;
}

interface NagbarItem {
  type: unknown;
  influxBanner?: ReactNode;
}

let notices: Notice[] | undefined;

function getNotices(): Notice[] {
  if (notices) return notices;
  const saved = getPluginData("RelationshipNotifier").notices;
  const initial = Array.isArray(saved)
    ? saved.filter((notice) => typeof notice?.message === "string")
    : [];
  notices = observable()?.array(initial, { deep: false }) ?? initial;
  return notices;
}

function persist(): void {
  getPluginData("RelationshipNotifier").notices = getNotices().slice();
  saveSettings();
}

export function addNotice(message: string): void {
  const list = getNotices();
  list.push({ message, at: Date.now() });
  if (list.length > MAXIMUM_NOTICES) list.splice(0, list.length - MAXIMUM_NOTICES);
  persist();
}

function dismissLatest(): void {
  getNotices().pop();
  persist();
}

function dismissAll(): void {
  getNotices().splice(0);
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

export const nagbarFound = (): boolean =>
  [Components.Nagbar, Components.NagbarContent, Components.NagbarButton].every(found);

function Banner({ isMobile }: { isMobile: boolean }) {
  const list = getNotices();
  const latest = list[list.length - 1];
  const more = list.length - 1;
  const message = `${latest.message} (${formatTime(latest.at)})${more > 0 ? ` +${more} more` : ""}`;

  return (
    <Components.Nagbar
      isMobile={isMobile}
      backgroundColor="var(--brand-primary)"
      textColor="var(--text-on-brand-primary)"
      dismissible
      onDismiss={dismissAll}
    >
      <Components.NagbarContent
        isMobile={isMobile}
        message={message}
        onDismiss={dismissAll}
        actions={
          more > 0 ? (
            <>
              <Components.NagbarButton isMobile={isMobile} onClick={dismissLatest}>
                Next
              </Components.NagbarButton>
              <Components.NagbarButton isMobile={isMobile} onClick={dismissAll}>
                Dismiss all
              </Components.NagbarButton>
            </>
          ) : (
            <Components.NagbarButton isMobile={isMobile} onClick={dismissAll}>
              Dismiss
            </Components.NagbarButton>
          )
        }
      />
    </Components.Nagbar>
  );
}

export function withBanner<T extends NagbarItem>(items: T[], isMobile: boolean): T[] {
  if (!nagbarFound() || !hasNotices()) return items;
  const banner = { type: "influx_relationship_notifier" } as unknown as T;
  banner.influxBanner = <Banner key="influx-relationship-notifier" isMobile={isMobile} />;
  return [banner, ...items];
}
