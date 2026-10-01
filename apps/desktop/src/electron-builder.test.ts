import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("electron-builder configuration", () => {
  const rootDir = path.resolve(__dirname, "..");
  const builderConfigPath = path.join(rootDir, "electron-builder.json");
  const packageJsonPath = path.join(rootDir, "package.json");
  const buildDir = path.join(rootDir, "build");

  it("has a valid electron-builder.json with correct appId and asarUnpack", () => {
    expect(fs.existsSync(builderConfigPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(builderConfigPath, "utf-8")) as {
      appId: string;
      productName: string;
      asarUnpack: string[];
      win: { target: string[]; icon: string };
      mac: { target: string[]; icon: string; category: string };
      linux: { target: string[]; icon: string; category: string };
    };

    expect(config.appId).toBe("edu.lsu.csc.jevschedule");
    expect(config.productName).toBe("JevSchedule");
    expect(config.asarUnpack).toContain("**/node_modules/better-sqlite3/prebuilds/**/*");
    expect(config.asarUnpack).toContain("**/node_modules/better-sqlite3/lib/**/*");

    expect(config.win.target).toContain("nsis");
    expect(config.mac.target).toContain("dmg");
    expect(config.linux.target).toContain("AppImage");
  });

  it("contains build scripts in package.json", () => {
    expect(fs.existsSync(packageJsonPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["dist"]).toBe("pnpm build && electron-builder");
    expect(pkg.scripts["dist:win"]).toBe("pnpm build && electron-builder --win");
    expect(pkg.scripts["dist:mac"]).toBe("pnpm build && electron-builder --mac");
    expect(pkg.scripts["dist:linux"]).toBe("pnpm build && electron-builder --linux");
  });

  it("has app icon resources in build directory", () => {
    expect(fs.existsSync(path.join(buildDir, "icon.ico"))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, "icon.icns"))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, "icon.png"))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, "icons", "512x512.png"))).toBe(true);
  });
});
