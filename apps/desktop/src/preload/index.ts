import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type JevscheduleApi } from "../shared/ipc.js";

const api: JevscheduleApi = {
  completed: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.completedGet),
    set: (code, completed) => ipcRenderer.invoke(IPC_CHANNELS.completedSet, code, completed),
  },
};

contextBridge.exposeInMainWorld("jevschedule", api);
