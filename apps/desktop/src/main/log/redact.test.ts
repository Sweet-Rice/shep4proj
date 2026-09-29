import { describe, expect, it } from "vitest";
import { REDACTED, redactLogText } from "./redact.js";

// Fake secrets are assembled at runtime so no credential-shaped literal sits in source for
// gitleaks to flag (same approach as packages/workday's makeFakeJwtForTests).
const shortSecret = ["fk", "9x", "Q2"].join("");
const longSecret = ["fake", "session", "value", "not", "real", "0123456789"].join("-");
const hexSecret = "deadbeef".repeat(5);
const base64Secret = Buffer.from("not a real credential, only test padding bytes").toString(
  "base64",
);
const fakeJwt = [
  Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: "test-subject", iat: 0 })).toString("base64url"),
  Buffer.from("not-a-real-signature").toString("base64url"),
].join(".");

describe("redactLogText", () => {
  it.each([
    [
      "Cookie header",
      `Cookie: sid=${shortSecret}; wd-browser-id=${longSecret}`,
      [shortSecret, longSecret],
    ],
    ["Set-Cookie header", `set-cookie: PLAY_SESSION=${longSecret}; Path=/; HttpOnly`, [longSecret]],
    ["Authorization header", `Authorization: Bearer ${longSecret}`, [longSecret]],
    ["bare bearer token", `retrying with Bearer ${shortSecret}`, [shortSecret]],
    ["session-secure-token header", `session-secure-token: ${shortSecret}`, [shortSecret]],
    ["JSON token field", `{"sessionSecureToken":"${longSecret}","ok":true}`, [longSecret]],
    ["single-quoted field", `{ cookie: 'sid=${shortSecret}', count: 3 }`, [shortSecret]],
    ["short sid pair", `sid=${shortSecret}`, [shortSecret]],
    ["password pair", `password=${shortSecret}&user=x`, [shortSecret]],
    ["csrf pair", `csrfToken: ${shortSecret}`, [shortSecret]],
    [
      "query string",
      `GET https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld?clientRequestID=${hexSecret}`,
      [hexSecret],
    ],
    [
      "URL fragment",
      `redirected to https://login.example.com/cb#code=${shortSecret}&state=abc`,
      [shortSecret],
    ],
    ["JWT without context", `unexpected value ${fakeJwt} in response`, [fakeJwt]],
    ["long hex without context", `id ${hexSecret} rejected`, [hexSecret]],
    ["long base64 without context", `blob ${base64Secret} rejected`, [base64Secret]],
  ])("removes secrets from a %s", (_label, input, secrets) => {
    const output = redactLogText(input);
    for (const secret of secrets) expect(output).not.toContain(secret);
    expect(output).toContain(REDACTED);
  });

  it("removes a token from a URL path", () => {
    const pathToken = Buffer.from(`${longSecret}-Path-Segment-42`).toString("base64url");
    const output = redactLogText(`GET https://www.myworkday.com/lsu/session/${pathToken}/data`);
    expect(output).not.toContain(pathToken);
  });

  it.each([
    "    at createWindow (file:///home/student/projects/jevschedule/apps/desktop/out/main/index.js:30:15)",
    "    at open (/Users/Student/Library/Application Support/jevschedule/out/main/index.js:12:3)",
    "wrote /home/student/.config/jevschedule/database/local-planner-store.sqlite",
  ])("keeps file paths in %j", (line) => {
    expect(redactLogText(line)).toBe(line);
  });

  it("keeps header and key names so the line still reads", () => {
    expect(redactLogText(`Cookie: sid=${shortSecret}`)).toBe(`Cookie: ${REDACTED}`);
    expect(redactLogText(`token=${shortSecret}`)).toBe(`token=${REDACTED}`);
    expect(redactLogText(`{"authToken":"${shortSecret}"}`)).toBe(`{"authToken":${REDACTED}}`);
  });

  it("keeps the URL but drops its query and fragment", () => {
    expect(redactLogText(`GET https://www.myworkday.com/lsu/app-root?x=${shortSecret}`)).toBe(
      `GET https://www.myworkday.com/lsu/app-root?${REDACTED}`,
    );
  });

  it("keeps the other fields of an inspected object", () => {
    expect(redactLogText(`{ cookie: 'sid=${shortSecret}', count: 3 }`)).toBe(
      `{ cookie: ${REDACTED}, count: 3 }`,
    );
  });

  it("does not redact an already-redacted value twice", () => {
    expect(redactLogText(`Cookie: sid=${shortSecret}`)).not.toContain(`${REDACTED}]`);
  });

  it.each([
    "import finished: 21 completed, 2 withdrawn, 0 unrecognized",
    "launching msedge (fallback: chrome)",
    "login result: cancelled (page-closed)",
    "GET https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld 200 in 812 ms",
    "parsed CSC 4330 Software Systems Development (3)",
    "profile dir removed: true",
  ])("leaves ordinary message %j unchanged", (message) => {
    expect(redactLogText(message)).toBe(message);
  });
});
