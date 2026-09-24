import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";

describe("buildServer", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("answers GET /health with 200 and { status: 'ok' }", async () => {
    app = buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.json()).toEqual({ status: "ok" });
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
