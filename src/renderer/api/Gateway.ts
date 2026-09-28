import { Logger } from "../utils/Logger";
import type { Patch } from "../webpack/types";

const logger = new Logger("Gateway");

export type GatewayHandler = (data: any, context: unknown) => void;
type GatewayListener = (data: any) => void;

const listeners = new Map<string, Map<GatewayListener, string>>();

// Returns a function that removes the listeners again.
export function onGatewayEvents(
  plugin: string,
  eventListeners: Record<string, GatewayListener>,
): () => void {
  for (const [event, listener] of Object.entries(eventListeners)) {
    let forEvent = listeners.get(event);
    if (!forEvent) listeners.set(event, (forEvent = new Map()));
    forEvent.set(listener, plugin);
  }
  return () => {
    for (const [event, listener] of Object.entries(eventListeners)) {
      listeners.get(event)?.delete(listener);
    }
  };
}

// Runs the listeners for each event before Fluxer's own handler.
export function hookGatewayEvents(registry: Map<string, GatewayHandler>): void {
  for (const [event, original] of registry) {
    registry.set(event, (data, context) => {
      for (const [listener, plugin] of listeners.get(event) ?? []) {
        try {
          listener(data);
        } catch (error) {
          logger.error(`${plugin} failed on ${event}`, error);
        }
      }
      original(data, context);
    });
  }
}

export const gatewayPatch: Patch = {
  plugin: "Gateway",
  find: '"SESSIONS_REPLACE"',
  replacement: {
    match: /([\w$]+)\.set\("SESSIONS_REPLACE",\(\)=>\{\}\)/,
    replace: "$&,Influx.Gateway.hookGatewayEvents($1)",
  },
};
