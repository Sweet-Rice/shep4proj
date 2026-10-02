import { z } from "zod";

export interface WatchSection {
  term: string;
  courseCode: string;
  sectionNumber: string;
  sectionType: string;
}

export interface WatchStatus extends WatchSection {
  enrollment: number;
  capacity: number;
  lastOpenedAt: string | null;
}

export interface WatchClient {
  create(section: WatchSection): Promise<string>;
  remove(id: string): Promise<void>;
  get(id: string): Promise<WatchStatus | null>;
}

const WatchIdSchema = z.object({ id: z.string().uuid() });
const WatchStatusSchema = z.object({
  term: z.string(),
  courseCode: z.string(),
  sectionNumber: z.string(),
  sectionType: z.string(),
  enrollment: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
  lastOpenedAt: z.string().datetime({ offset: true }).nullable(),
});

/** Creates or checks watches through the server without ever logging a bearer ID. */
export function createWatchClient(baseUrl: string, fetchImpl: typeof fetch = fetch): WatchClient {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("JEVSCHEDULE_API_URL must be an http(s) URL");
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("JEVSCHEDULE_API_URL must be an http(s) URL");
  }
  base.pathname = base.pathname.replace(/\/+$/, "");
  const baseString = base.toString().replace(/\/$/, "");

  async function request(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(`${baseString}${path}`, init);
    } catch {
      throw new Error(`Watch service unreachable at ${baseString}`);
    }
  }

  return {
    async create(section) {
      const response = await request("/watches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(section),
      });
      if (!response.ok) throw new Error(`Watch service returned HTTP ${response.status}`);
      return WatchIdSchema.parse(await response.json()).id;
    },
    async remove(id) {
      const response = await request("/watches", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error(`Watch service returned HTTP ${response.status}`);
    },
    async get(id) {
      const response = await request(`/watches/${encodeURIComponent(id)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Watch service returned HTTP ${response.status}`);
      return WatchStatusSchema.parse(await response.json());
    },
  };
}
