/**
 * Thrown when a Course Offerings page no longer has the structure the section parser expects.
 * Like `CatalogShapeError`, failing loudly keeps a portal redesign from silently producing an
 * empty or partial section list.
 */
export class SectionShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SectionShapeError";
  }
}
