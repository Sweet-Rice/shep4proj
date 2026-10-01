import {
  CourseDetailSchema,
  CourseSchema,
  DegreeProgramSchema,
  DegreeSummarySchema,
  type Course,
  type CourseCode,
  type CourseDetail,
  type DegreeProgram,
  type DegreeSummary,
} from "@jevschedule/shared";
import { z } from "zod";

export interface CatalogClient {
  listCourses(): Promise<Course[]>;
  getCourseDetails(codes: readonly CourseCode[]): Promise<Record<CourseCode, CourseDetail>>;
  listDegrees(): Promise<DegreeSummary[]>;
  getDegree(id: string): Promise<DegreeProgram>;
}

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";

const CoursesResponseSchema = z.object({ courses: z.array(CourseSchema) });
const DegreesResponseSchema = z.object({ degrees: z.array(DegreeSummarySchema) });

export function createCatalogClient(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): CatalogClient {
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

  let coursesCache: Course[] | undefined;
  let degreesCache: DegreeSummary[] | undefined;
  const courseDetails = new Map<CourseCode, CourseDetail>();
  const degrees = new Map<string, DegreeProgram>();

  async function request(path: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseString}${path}`);
    } catch {
      throw new Error(`Course catalog server unreachable at ${baseString}`);
    }
    return response;
  }

  async function json<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
    const response = await request(path);
    if (!response.ok) {
      throw new Error(`Course catalog request failed: GET ${path} returned ${response.status}`);
    }
    return schema.parse(await response.json());
  }

  return {
    async listCourses() {
      if (coursesCache) return coursesCache;
      const { courses } = await json("/courses", CoursesResponseSchema);
      coursesCache = courses;
      return courses;
    },
    async getCourseDetails(codes) {
      const unique = [...new Set(codes)];
      const uncached = unique.filter((code) => !courseDetails.has(code));
      let cursor = 0;
      const workers = Array.from({ length: Math.min(6, uncached.length) }, async () => {
        while (cursor < uncached.length) {
          const code = uncached[cursor++];
          if (code === undefined) continue;
          const pathCode = code.replace(" ", "-");
          const response = await request(`/courses/${pathCode}`);
          if (response.status === 404) continue;
          if (!response.ok) {
            throw new Error(
              `Course catalog request failed: GET /courses/${pathCode} returned ${response.status}`,
            );
          }
          const detail = CourseDetailSchema.parse(await response.json());
          courseDetails.set(code, detail);
        }
      });
      await Promise.all(workers);
      const result: Record<CourseCode, CourseDetail> = {};
      for (const code of unique) {
        const detail = courseDetails.get(code);
        if (detail) result[code] = detail;
      }
      return result;
    },
    async listDegrees() {
      if (degreesCache) return degreesCache;
      const { degrees: summaries } = await json("/degrees", DegreesResponseSchema);
      degreesCache = summaries;
      return summaries;
    },
    async getDegree(id) {
      const cached = degrees.get(id);
      if (cached) return cached;
      const degree = await json(`/degrees/${encodeURIComponent(id)}`, DegreeProgramSchema);
      degrees.set(id, degree);
      return degree;
    },
  };
}
