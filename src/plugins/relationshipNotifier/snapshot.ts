import type { GuildWire, ReadyPayload, RelationshipWire } from "@webpack/fluxer";

interface KnownRelationship {
  type: number;
  name: string;
}

// What Influx last saw of your friends, friend requests, and servers, keyed by id.
export interface Snapshot {
  relationships: Record<string, KnownRelationship>;
  guilds: Record<string, string | null>;
}

export type Removal =
  | { kind: "friend" | "incomingRequest" | "outgoingRequest"; id: string; name: string }
  | { kind: "guild"; id: string; name: string | null };

export function relationshipName(wire: RelationshipWire, fallback?: string): string {
  const username = wire.user?.username;
  const name = wire.nickname || wire.user?.global_name || username;
  if (!name) return fallback ?? `User ${wire.id}`;
  if (!username || name === username) return `@${name}`;
  return `${name} (@${username})`;
}

export function guildName(wire: GuildWire): string | null {
  return wire.properties?.name ?? wire.name ?? null;
}

export function snapshotFromReady(ready: ReadyPayload, previous?: Snapshot): Snapshot {
  const relationships: Snapshot["relationships"] = {};
  for (const wire of ready.relationships ?? []) {
    relationships[wire.id] = {
      type: wire.type,
      name: relationshipName(wire, previous?.relationships[wire.id]?.name),
    };
  }
  const guilds: Snapshot["guilds"] = {};
  for (const wire of ready.guilds ?? []) {
    // Servers that are briefly unavailable still arrive as stubs, just without a name.
    guilds[wire.id] = guildName(wire) ?? previous?.guilds[wire.id] ?? null;
  }
  return { relationships, guilds };
}

// Keyed by Fluxer's relationship type. Type 2, a blocked user, isn't reported.
const REMOVAL_KINDS: Record<number, Exclude<Removal["kind"], "guild"> | undefined> = {
  1: "friend",
  3: "incomingRequest",
  4: "outgoingRequest",
};

export function relationshipRemoval(id: string, known: KnownRelationship): Removal | null {
  const kind = REMOVAL_KINDS[known.type];
  return kind ? { kind, id, name: known.name } : null;
}

// Only disappearances count: a request that became a friendship, or a friend you blocked, isn't a removal.
export function diffSnapshots(previous: Snapshot, next: Snapshot): Removal[] {
  const removals: Removal[] = [];
  for (const [id, known] of Object.entries(previous.relationships)) {
    if (next.relationships[id]) continue;
    const removal = relationshipRemoval(id, known);
    if (removal) removals.push(removal);
  }
  for (const [id, name] of Object.entries(previous.guilds)) {
    if (!(id in next.guilds)) removals.push({ kind: "guild", id, name });
  }
  return removals;
}

export function describeRemoval(removal: Removal, whileAway: boolean): string {
  const suffix = whileAway ? " while you were away" : "";
  switch (removal.kind) {
    case "friend":
      return `${removal.name} removed you as a friend${suffix}.`;
    case "incomingRequest":
      return `${removal.name} canceled their friend request${suffix}.`;
    case "outgoingRequest":
      return `${removal.name} declined your friend request${suffix}.`;
    case "guild":
      return whileAway
        ? `You were removed from ${removal.name ?? "a server"} while you were away.`
        : `You're no longer in ${removal.name ?? "a server"}.`;
  }
}
