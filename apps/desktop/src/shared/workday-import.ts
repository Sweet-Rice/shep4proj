const COMPLETED_GRADE = /^(?:[ABCD][+-]?|P|Pass)$/i;

/** Whether `grade` earns credit, so the course can enter the completed store. */
export function isCompletedGrade(grade: string): boolean {
  return COMPLETED_GRADE.test(grade);
}
