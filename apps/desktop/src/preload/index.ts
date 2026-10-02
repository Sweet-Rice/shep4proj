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
  catalog: {
    listCourses: () => ipcRenderer.invoke(IPC_CHANNELS.catalogCourses),
    getCourseDetails: (codes) => ipcRenderer.invoke(IPC_CHANNELS.catalogCourseDetails, codes),
    getCourseHistory: (code) => ipcRenderer.invoke(IPC_CHANNELS.catalogCourseHistory, code),
    listDegrees: () => ipcRenderer.invoke(IPC_CHANNELS.catalogDegrees),
    getDegree: (id) => ipcRenderer.invoke(IPC_CHANNELS.catalogDegree, id),
  },
};

contextBridge.exposeInMainWorld("jevschedule", api);
