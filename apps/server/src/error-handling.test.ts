import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";
import { createDb } from "./db/client.js";
import { requestLogSerializers } from "./request-log.js";

const id = "0f6b6a1c-3c2e-4b55-9d1f-2b8c5f0e7a11";

let app: FastifyInstance | undefined;
let closeDb: (() => Promise<void>) | undefined;

afterEach(async () => {
  await app?.close();
  await closeDb?.();
  app = undefined;
  closeDb = undefined;
});

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, logger: { stream, serializers: requestLogSerializers } };
}

/** A database nothing listens on: every query fails the way a database outage does. */
function unreachableDb() {
  const { db, close } = createDb("postgres://jevschedule:jevschedule@127.0.0.1:1/jevschedule");
  closeDb = close;
  return db;
}

describe("server errors never carry a watch's bearer ID", () => {
  it("keeps the ID out of the log and the 500 body when GET /watches/:id cannot reach the database", async () => {
    const { lines, logger } = captureLogger();
    app = buildServer({ db: unreachableDb(), logger });

    const response = await app.inject({ method: "GET", url: `/watches/${id}` });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Internal Server Error" });
    expect(response.body).not.toContain(id);
    const logged = lines.join("");
    expect(logged).not.toContain(id);
    // The failure is still logged for operators, as an error-level line.
    expect(
      lines.map((line) => JSON.parse(line) as { level: number }).some((e) => e.level === 50),
    ).toBe(true);
  });

  it("keeps the ID out of the log and the 500 body when DELETE /watches cannot reach the database", async () => {
    const { lines, logger } = captureLogger();
    app = buildServer({ db: unreachableDb(), logger });

    const response = await app.inject({ method: "DELETE", url: "/watches", payload: { id } });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Internal Server Error" });
    expect(response.body).not.toContain(id);
    expect(lines.join("")).not.toContain(id);
  });

  it("keeps the ID out of the log and the 404 body for an unknown route under /watches/:id", async () => {
    const { lines, logger } = captureLogger();
    app = buildServer({ db: unreachableDb(), logger });

    const response = await app.inject({ method: "GET", url: `/watches/${id}/x` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not Found" });
    expect(response.body).not.toContain(id);
    expect(lines.join("")).not.toContain(id);
  });

  it("keeps the ID out of the log and the 404 body when the watch routes are not registered", async () => {
    const { lines, logger } = captureLogger();
    app = buildServer({ logger });

    const response = await app.inject({ method: "GET", url: `/watches/${id}` });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(id);
    expect(lines.join("")).not.toContain(id);
  });

  it("still reports client errors with their own status and message", async () => {
    app = buildServer({ db: unreachableDb() });

    const response = await app.inject({
      method: "POST",
      url: "/watches",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/JSON/);
  });
});
