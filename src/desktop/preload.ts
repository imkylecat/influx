import { contextBridge, ipcRenderer } from "electron";
import {
  FLUXER_APP_HOSTS,
  IPC_GET_RENDERER,
  IPC_UPDATER_CHECK,
  IPC_UPDATER_INSTALL,
  IPC_UPDATER_RESTART,
} from "./constants";
import type { InfluxNative } from "./types";

if (process.isMainFrame && FLUXER_APP_HOSTS.includes(location.hostname)) {
  const native: InfluxNative = {
    updater: {
      check: () => ipcRenderer.invoke(IPC_UPDATER_CHECK),
      install: () => ipcRenderer.invoke(IPC_UPDATER_INSTALL),
      restart: () => ipcRenderer.invoke(IPC_UPDATER_RESTART),
    },
  };
  contextBridge.exposeInMainWorld("InfluxNative", native);

  const code: string = ipcRenderer.sendSync(IPC_GET_RENDERER);
  contextBridge.executeInMainWorld({
    func: (source: string) => (0, eval)(source),
    args: [`${code}\n//# sourceURL=influx-renderer.js`],
  });
}
