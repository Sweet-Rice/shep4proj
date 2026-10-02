import { expect, it, vi } from "vitest";
import { createWatchClient } from "./watches.js";

const section = {
  term: "LSUAM_FALL_2026",
  courseCode: "CSC 4330",
  sectionNumber: "001",
  sectionType: "LEC",
};
const id = "9ab43d1e-38a4-4fa2-82ee-33b66fe0eab7";
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

it("creates, removes, and retrieves a watch through the expected API endpoints", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(response({ id }, 201))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      response({ ...section, enrollment: 78, capacity: 80, lastOpenedAt: null }),
    );
  const client = createWatchClient("http://127.0.0.1:3132/api/", fetchImpl as typeof fetch);

  expect(await client.create(section)).toBe(id);
  await client.remove(id);
  expect(await client.get(id)).toEqual({
    ...section,
    enrollment: 78,
    capacity: 80,
    lastOpenedAt: null,
  });
  expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
    "http://127.0.0.1:3132/api/watches",
    "http://127.0.0.1:3132/api/watches",
    `http://127.0.0.1:3132/api/watches/${id}`,
  ]);
  expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
    method: "POST",
    body: JSON.stringify(section),
  });
  expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
});

it("returns null for removed server watches and rejects non-http API URLs", async () => {
  const client = createWatchClient("https://api.example.test", async () => response({}, 404));
  await expect(client.get(id)).resolves.toBeNull();
  expect(() => createWatchClient("file:///tmp/api")).toThrow(
    "JEVSCHEDULE_API_URL must be an http(s) URL",
  );
});
