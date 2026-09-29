/**
 * Thrown when a catalog page no longer has the structure a parser expects
 * (missing rows, an unexpected row format, duplicate entries). Failing loudly
 * here keeps a site redesign from silently producing an empty or partial
 * course list.
 */
export class CatalogShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogShapeError";
  }
}
