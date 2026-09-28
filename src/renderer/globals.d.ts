declare module "~plugins" {
  import type { PluginDefinition } from "@api/Plugins";
  const plugins: PluginDefinition[];
  export default plugins;
}

declare const INFLUX_VERSION: string;
declare const INFLUX_DEVELOPMENT: boolean;
