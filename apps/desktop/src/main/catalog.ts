import {
  CourseDetailSchema,
  CourseSchema,
  DegreeProgramSchema,
  DegreeSummarySchema,
  SectionSchema,
  type AcademicPeriodId,
  type Course,
  type CourseCode,
  type CourseDetail,
  type CourseOfferingHistory,
  type DegreeProgram,
  type DegreeSummary,
  type Section,
} from "@jevschedule/shared";
import { z } from "zod";

export interface CatalogClient {
  listCourses(): Promise<Course[]>;
  getCourseDetails(codes: readonly CourseCode[]): Promise<Record<CourseCode, CourseDetail>>;
  getCourseHistory(code: CourseCode): Promise<CourseOfferingHistory[]>;
  listSections(courseCode: CourseCode, term: AcademicPeriodId): Promise<Section[]>;
  listDegrees(): Promise<DegreeSummary[]>;
  getDegree(id: string): Promise<DegreeProgram>;
}

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";

export function resolveApiBaseUrl(
  runtime: string | undefined,
  buildTime: string | undefined,
): string {
  return runtime || buildTime || DEFAULT_API_BASE_URL;
}

const COURSE_DETAILS_BATCH_SIZE = 500;
const CoursesResponseSchema = z.object({ courses: z.array(CourseSchema) });
const CourseDetailsResponseSchema = z.object({ courses: z.array(CourseDetailSchema) });
const SectionsResponseSchema = z.object({ sections: z.array(SectionSchema) });
const DegreesResponseSchema = z.object({ degrees: z.array(DegreeSummarySchema) });
const CourseHistoryResponseSchema = z.object({
  history: z.array(
    z.object({
      term: z.string(),
      sectionCount: z.number().int(),
      capturedAt: z.string(),
    }),
  ),
});

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
  const courseHistory = new Map<CourseCode, CourseOfferingHistory[]>();
  const degrees = new Map<string, DegreeProgram>();

  // Set once the server answers 404 to the batch route, e.g. a server that predates it.
  let batchDetailsUnsupported = false;

  async function request(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await (init
        ? fetchImpl(`${baseString}${path}`, init)
        : fetchImpl(`${baseString}${path}`));
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

  /** Fallback for servers without POST /courses/details: one GET per course, six at a time. */
  async function fetchDetailsIndividually(codes: readonly CourseCode[]): Promise<void> {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(6, codes.length) }, async () => {
      while (cursor < codes.length) {
        const code = codes[cursor++];
        if (code === undefined) continue;
        const pathCode = code.replace(" ", "-");
        const response = await request(`/courses/${pathCode}`);
        if (response.status === 404) continue;
        if (!response.ok) {
          throw new Error(
            `Course catalog request failed: GET /courses/${pathCode} returned ${response.status}`,
          );
        }
        courseDetails.set(code, CourseDetailSchema.parse(await response.json()));
      }
    });
    await Promise.all(workers);
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
      if (!batchDetailsUnsupported) {
        for (let start = 0; start < uncached.length; start += COURSE_DETAILS_BATCH_SIZE) {
          const chunk = uncached.slice(start, start + COURSE_DETAILS_BATCH_SIZE);
          const response = await request("/courses/details", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ codes: chunk }),
          });
          if (response.status === 404) {
            batchDetailsUnsupported = true;
            break;
          }
          if (!response.ok) {
            throw new Error(
              `Course catalog request failed: POST /courses/details returned ${response.status}`,
            );
          }
          const { courses: details } = CourseDetailsResponseSchema.parse(await response.json());
          for (const detail of details) courseDetails.set(detail.code, detail);
        }
      }
      // A server with the batch route omits unknown codes, so only a 404 falls back.
      if (batchDetailsUnsupported) {
        await fetchDetailsIndividually(uncached.filter((code) => !courseDetails.has(code)));
      }
      const result: Record<CourseCode, CourseDetail> = {};
      for (const code of unique) {
        const detail = courseDetails.get(code);
        if (detail) result[code] = detail;
      }
      return result;
    },
    async getCourseHistory(code) {
      const cached = courseHistory.get(code);
      if (cached) return cached;
      const pathCode = code.replace(" ", "-");
      const path = `/courses/${pathCode}/history`;
      const response = await request(path);
      if (response.status === 404) {
        courseHistory.set(code, []);
        return [];
      }
      if (!response.ok) {
        throw new Error(`Course catalog request failed: GET ${path} returned ${response.status}`);
      }
      const { history } = CourseHistoryResponseSchema.parse(await response.json());
      const result = history.map(({ term, sectionCount }) => ({ term, sectionCount }));
      courseHistory.set(code, result);
      return result;
    },
    async listSections(courseCode, term) {
      const pathCode = courseCode.replace(" ", "-");
      const { sections } = await json(
        `/sections?course=${pathCode}&term=${term}`,
        SectionsResponseSchema,
      );
      return sections;
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
