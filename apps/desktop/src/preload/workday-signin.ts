import { contextBridge } from "electron";

// A page's window.close() destroys an Electron window without a cancellable "close" event.
// Disable it before sign-in pages run, so the popup stays open until the app has read the
// Workday session. The window's own close button still cancels sign-in.
contextBridge.executeInMainWorld({
  func: () => {
    window.close = () => undefined;
  },
});
