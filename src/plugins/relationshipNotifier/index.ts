import { onGatewayEvents } from "@api/Gateway";
import definePlugin from "@api/Plugins";
import { definePluginSettings, getPluginData, saveSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { NativeNotification, showToast, Stores } from "@webpack/common";
import type { GuildWire, ReadyPayload, RelationshipWire } from "@webpack/fluxer";

import { addNotice, hasNotices, nagbarFound, nagbarPartsSource, withBanner } from "./banner";
import {
  describeRemoval,
  diffSnapshots,
  guildName,
  relationshipName,
  relationshipRemoval,
  type Removal,
  type Snapshot,
  snapshotFromReady,
} from "./snapshot";

const logger = new Logger("RelationshipNotifier");
const SELF_ACTION_EXPIRY_MILLISECONDS = 60_000;

const settings = definePluginSettings({
  friends: {
    type: "boolean",
    description: "Notify when someone removes you as a friend.",
    default: true,
  },
  friendRequests: {
    type: "boolean",
    description: "Notify when a friend request to or from you is canceled or declined.",
    default: true,
  },
  servers: {
    type: "boolean",
    description: "Notify when you're kicked or banned from a server, or it's deleted.",
    default: true,
  },
  whileAway: {
    type: "boolean",
    description:
      "When Fluxer starts or reconnects, report anything above that happened while it was closed.",
    default: true,
  },
  banner: {
    type: "boolean",
    description: "Keep a banner at the top of Fluxer until you dismiss it, even across restarts.",
    default: true,
  },
  popup: {
    type: "boolean",
    description: "Also show a short pop-up notice.",
    default: false,
  },
  desktopNotifications: {
    type: "boolean",
    description: "Also show a system notification.",
    default: false,
  },
});

// Ids of friends and servers you removed yourself, so those removals don't notify.
const selfActions = new Map<string, ReturnType<typeof setTimeout>>();

function consumeSelfAction(id: string): boolean {
  const timer = selfActions.get(id);
  if (timer === undefined) return false;
  clearTimeout(timer);
  selfActions.delete(id);
  return true;
}

// The snapshot is kept per account, since Fluxer can switch between several.
let accountId: string | null = null;
let snapshot: Snapshot | null = null;
let stopListening: (() => void) | undefined;

function savedSnapshots(): Record<string, Snapshot> {
  const data = getPluginData("RelationshipNotifier");
  if (data.snapshots == null || typeof data.snapshots !== "object") data.snapshots = {};
  return data.snapshots as Record<string, Snapshot>;
}

function saveSnapshot(): void {
  if (!accountId || !snapshot) return;
  savedSnapshots()[accountId] = snapshot;
  saveSettings();
}

function isWanted(removal: Removal): boolean {
  if (removal.kind === "friend") return settings.store.friends;
  if (removal.kind === "guild") return settings.store.servers;
  return settings.store.friendRequests;
}

function notify(message: string): void {
  if (settings.store.banner) addNotice(message);
  // Without a banner, fall back to a pop-up so the notice isn't silently dropped.
  if (settings.store.popup || !settings.store.banner || !nagbarFound) {
    showToast("info", message, { timeout: 10_000 });
  }
  if (!settings.store.desktopNotifications) return;
  void NativeNotification()?.({ title: "Influx", body: message }).catch((error) =>
    logger.error("Couldn't show a notification", error),
  );
}

function report(removal: Removal, whileAway: boolean): void {
  if (isWanted(removal)) notify(describeRemoval(removal, whileAway));
}

function onReady(data: ReadyPayload): void {
  accountId = data.user?.id ?? Stores.Users()?.currentUserId ?? null;
  if (!accountId) return;
  const previous = savedSnapshots()[accountId];
  const next = snapshotFromReady(data, previous);
  // The first time Influx sees an account there's nothing to compare against yet.
  if (previous && settings.store.whileAway) {
    for (const removal of diffSnapshots(previous, next)) report(removal, true);
  }
  snapshot = next;
  saveSnapshot();
}

function onRelationshipChange(data: RelationshipWire): void {
  if (!snapshot) return;
  const known = snapshot.relationships[data.id];
  snapshot.relationships[data.id] = {
    type: data.type ?? known?.type,
    name: data.user ? relationshipName(data) : (known?.name ?? relationshipName(data)),
  };
  saveSnapshot();
}

function onRelationshipRemove(data: { id: string }): void {
  const known = snapshot?.relationships[data.id];
  if (snapshot) {
    delete snapshot.relationships[data.id];
    saveSnapshot();
  }
  if (!known || consumeSelfAction(data.id)) return;
  const removal = relationshipRemoval(data.id, known);
  if (removal) report(removal, false);
}

function onGuildChange(data: GuildWire): void {
  if (!snapshot || data.unavailable) return;
  const name = guildName(data);
  if (data.id in snapshot.guilds && (name == null || snapshot.guilds[data.id] === name)) return;
  snapshot.guilds[data.id] = name ?? snapshot.guilds[data.id] ?? null;
  saveSnapshot();
}

function onGuildDelete(data: { id: string; unavailable?: boolean }): void {
  // An unavailable server is an outage, not a removal.
  if (data.unavailable) return;
  const known = snapshot && data.id in snapshot.guilds;
  const name = snapshot?.guilds[data.id] ?? Stores.Guilds()?.getGuild(data.id)?.name ?? null;
  if (snapshot && known) {
    delete snapshot.guilds[data.id];
    saveSnapshot();
  }
  if (consumeSelfAction(data.id)) return;
  report({ kind: "guild", id: data.id, name }, false);
}

const LISTENERS: Record<string, (data: any) => void> = {
  READY: onReady,
  RELATIONSHIP_ADD: onRelationshipChange,
  RELATIONSHIP_UPDATE: onRelationshipChange,
  RELATIONSHIP_REMOVE: onRelationshipRemove,
  GUILD_CREATE: onGuildChange,
  GUILD_UPDATE: onGuildChange,
  GUILD_DELETE: onGuildDelete,
};

export default definePlugin({
  name: "RelationshipNotifier",
  description:
    "Notifies you when a friend removes you, a friend request is canceled, or you're removed from a server, including while Fluxer was closed.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: 'case"remove":yield',
      replacement: {
        match: /(case"remove":yield \i\.\i\.delete\(\i\.\i\.USER_RELATIONSHIP\()(\i\.userId)\)/,
        replace: "$1$self.markSelfAction($2))",
      },
    },
    {
      find: "Left guild ",
      replacement: [
        { match: /(\.USER_GUILDS\()(\i)\)/, replace: "$1$self.markSelfAction($2))" },
        { match: /(\.GUILD_DELETE\()(\i)\)/, replace: "$1$self.markSelfAction($2))" },
      ],
    },
    {
      find: '"app.app-layout.nagbar-container.container"',
      replacement: {
        match:
          /(\(\{nagbars:(\i)\}\)=>\{let (\i)=\i\.\i,[^;]*;return )0===\2\.length\?null:(\(0,\i\.jsx\)\("div",\{className:\i\.\i,"data-flx":"app\.app-layout\.nagbar-container\.container",children:)\2\.map\((\i)=>\{switch\(\5\.type\)\{/,
        replace: (_, head, list, mobile, container, item, _offset, code) =>
          `${head}0===${list}.length&&!$self.hasBanner()?null:${container}` +
          `$self.withBanner(${list},${nagbarPartsSource(code, `${mobile}.enabled`)})` +
          `.map(${item}=>{if(${item}.influxBanner)return ${item}.influxBanner;switch(${item}.type){`,
      },
    },
    {
      find: '"app.guilds-layout.nagbar-stack"',
      replacement: {
        match: /nagbar:!(\i)&&(\i)\.length>0\?/,
        replace: "nagbar:!$1&&($2.length>0||$self.hasBanner())?",
      },
    },
  ],

  hasBanner(): boolean {
    return settings.store.banner && nagbarFound && hasNotices();
  },

  withBanner,

  markSelfAction(id: string): string {
    consumeSelfAction(id);
    selfActions.set(
      id,
      setTimeout(() => selfActions.delete(id), SELF_ACTION_EXPIRY_MILLISECONDS),
    );
    return id;
  },

  start() {
    stopListening = onGatewayEvents(this.name, LISTENERS);
  },

  stop() {
    stopListening?.();
    for (const timer of selfActions.values()) clearTimeout(timer);
    selfActions.clear();
  },
});
