import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type { JevscheduleApi, WorkdayImportProgress } from "../shared/ipc.js";

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
    listSections: (courseCode, term) =>
      ipcRenderer.invoke(IPC_CHANNELS.catalogSections, courseCode, term),
    listDegrees: () => ipcRenderer.invoke(IPC_CHANNELS.catalogDegrees),
    getDegree: (id) => ipcRenderer.invoke(IPC_CHANNELS.catalogDegree, id),
  },
  academicProgress: {
    getAudit: () => ipcRenderer.invoke(IPC_CHANNELS.academicProgressGet),
  },
  workday: {
    start: () => ipcRenderer.invoke(IPC_CHANNELS.workdayImport),
    confirm: (review) => ipcRenderer.invoke(IPC_CHANNELS.workdayConfirm, review),
    onProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: WorkdayImportProgress) =>
        listener(progress);
      ipcRenderer.on(IPC_CHANNELS.workdayProgress, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.workdayProgress, handler);
    },
  },
};

contextBridge.exposeInMainWorld("jevschedule", api);
