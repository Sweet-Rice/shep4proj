import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {},
  preload: {
    // The windows are sandboxed, and sandboxed preloads must be CommonJS.
    build: {
      rollupOptions: {
        input: {
          index: "src/preload/index.ts",
          "workday-signin": "src/preload/workday-signin.ts",
        },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
});
