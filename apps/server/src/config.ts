/** Where the server listens. */
export interface ListenConfig {
  host: string;
  port: number;
}

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;

/**
 * Reads `HOST` and `PORT` from the environment. Defaults to localhost so a dev
 * server isn't reachable from the network unless `HOST` is set explicitly
 * (e.g. `0.0.0.0` inside a container). Throws on a malformed `PORT` rather
 * than silently falling back.
 */
export function readListenConfig(env: NodeJS.ProcessEnv = process.env): ListenConfig {
  const host = env.HOST?.trim() || DEFAULT_HOST;
  const rawPort = env.PORT?.trim();
  if (!rawPort) {
    return { host, port: DEFAULT_PORT };
  }
  if (!/^\d+$/.test(rawPort)) {
    throw new Error(`PORT must be an integer from 0 to 65535, got "${rawPort}"`);
  }
  const port = Number(rawPort);
  if (port > 65535) {
    throw new Error(`PORT must be an integer from 0 to 65535, got "${rawPort}"`);
  }
  return { host, port };
}
