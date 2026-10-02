import { Writable } from "node:stream";
import { afterEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";
import { requestLogSerializers } from "./request-log.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

it("logs watch status requests without the watch's bearer ID", async () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  app = buildServer({ logger: { stream, serializers: requestLogSerializers } });
  // Without a database the real watch routes aren't registered; stand in for GET /watches/:id.
  app.get("/watches/:id", async () => ({}));
  const id = "0f6b6a1c-3c2e-4b55-9d1f-2b8c5f0e7a11";

  await app.inject({ method: "GET", url: `/watches/${id}?x=1` });

  const logged = lines.join("");
  expect(logged).toContain('"url":"/watches/:id?x=1"');
  expect(logged).not.toContain(id);
});
