import { resolve, sep } from "node:path";

/**
 * True if `outDir` resolves to a path with a `raw/` segment anywhere in it.
 * Raw HAR captures must never be written to by the redaction tooling, so
 * any output path under a `raw/` directory is refused.
 */
export function isRawDir(outDir: string): boolean {
  const parts = resolve(outDir).split(sep);
  return parts.some((p) => p.toLowerCase() === "raw");
}

/** Builds the short, ID-free filename slug for a request's URL path. */
export function shortPathSlug(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      if (/^[0-9a-f-]{8,}$/i.test(seg) || /^\d+$/.test(seg)) return "id";
      return seg;
    });
  const slug = segments
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "root";
}
