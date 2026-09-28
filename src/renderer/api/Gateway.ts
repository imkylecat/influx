import { Logger } from "../utils/Logger";

const logger = new Logger("Gateway");

export type GatewayHandler = (data: any, context: unknown) => void;

// Runs each listener before Fluxer's own handler for its event.
export function hookGatewayEvents(
  registry: Map<string, GatewayHandler>,
  listeners: Record<string, (data: any) => void>,
  plugin: string,
): void {
  for (const [event, listener] of Object.entries(listeners)) {
    const original = registry.get(event);
    if (!original) continue;
    registry.set(event, (data, context) => {
      try {
        listener(data);
      } catch (error) {
        logger.error(`${plugin} failed on ${event}`, error);
      }
      original(data, context);
    });
  }
}
