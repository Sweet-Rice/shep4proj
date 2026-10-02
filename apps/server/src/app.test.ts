import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";

describe("buildServer", () => {
  let app: FastifyInstance | undefined;
  let originalRenderGitCommit: string | undefined;

  beforeEach(() => {
    originalRenderGitCommit = process.env["RENDER_GIT_COMMIT"];
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (originalRenderGitCommit === undefined) {
      delete process.env["RENDER_GIT_COMMIT"];
    } else {
      process.env["RENDER_GIT_COMMIT"] = originalRenderGitCommit;
    }
  });

  it("answers GET /health with a null commit when Render commit metadata is absent", async () => {
    delete process.env["RENDER_GIT_COMMIT"];
    app = buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.json()).toEqual({ status: "ok", commit: null });
  });

  it("answers GET /health with the Render deployment commit when available", async () => {
    process.env["RENDER_GIT_COMMIT"] = "abc123";
    app = buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", commit: "abc123" });
  });

  it("returns 404 for unknown routes", async () => {
    app = buildServer();
    const res = await app.inject({ method: "GET", url: "/nope" });

    expect(res.statusCode).toBe(404);
  });

  it("does not accept POST on /health", async () => {
    app = buildServer();
    const res = await app.inject({ method: "POST", url: "/health" });

    expect(res.statusCode).toBe(404);
  });
});
