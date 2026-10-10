declare module "~plugins" {
  import type { PluginDefinition } from "@api/Plugins";
  const plugins: PluginDefinition[];
  export default plugins;
}

declare const INFLUX_VERSION: string;
declare const INFLUX_DEVELOPMENT: boolean;
declare const INFLUX_DESKTOP: boolean;

declare module "*.css" {
  const styles: string;
  export default styles;
}
