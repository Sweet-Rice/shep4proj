/**
 * Test-only helper. Builds a syntactically valid but entirely fake JWT at
 * runtime (never a real credential) so tests can plant one for
 * scanForLeftovers() to catch, without a JWT-shaped string literal ever
 * appearing in source (which secret scanners like gitleaks would otherwise
 * flag as a leaked token).
 */
export function makeFakeJwtForTests(): string {
  const base64url = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = base64url({ alg: "none", typ: "JWT" });
  const payload = base64url({ sub: "test-subject", iat: 0 });
  const signature = Buffer.from("not-a-real-signature").toString("base64url");
  return [header, payload, signature].join(".");
}
