import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type JevscheduleApi } from "../shared/ipc.js";

const api: JevscheduleApi = {
  completed: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.completedGet),
    set: (code, completed) => ipcRenderer.invoke(IPC_CHANNELS.completedSet, code, completed),
  },
  plan: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.planGet),
    save: (plan) => ipcRenderer.invoke(IPC_CHANNELS.planSave, plan),
  },
  transcript: {
    select: () => ipcRenderer.invoke(IPC_CHANNELS.transcriptSelect),
  },
};

contextBridge.exposeInMainWorld("jevschedule", api);
