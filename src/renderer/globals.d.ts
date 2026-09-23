declare module "~plugins" {
  import type { PluginDef } from "@api/Plugins";
  const plugins: PluginDef[];
  export default plugins;
}

declare const INFLUX_VERSION: string;
declare const INFLUX_DEV: boolean;
