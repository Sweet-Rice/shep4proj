import { useState } from "react";
import type { CourseCode } from "@jevschedule/shared";

export interface ParsedTranscriptLine {
  code: CourseCode;
  term?: string;
  grade?: string;
  selected?: boolean;
}

export interface TranscriptParseResult {
  parsedCourses: ParsedTranscriptLine[];
  unrecognizedLines: string[];
}

export const SAMPLE_PARSE_RESULT: TranscriptParseResult = {
  parsedCourses: [
    { code: "CSC 1350", term: "Fall 2024", grade: "A", selected: true },
    { code: "MATH 1550", term: "Fall 2024", grade: "B+", selected: true },
    { code: "ENGL 1001", term: "Fall 2024", grade: "A-", selected: true },
    { code: "CSC 1351", term: "Spring 2025", grade: "B", selected: true },
  ],
  unrecognizedLines: [
    "PHYS 1000 - In Progress",
    "TOTAL CREDITS EARNED: 14.0",
    "CUMULATIVE GPA: 3.65",
  ],
};

export interface ImportReviewScreenProps {
  parseResult?: TranscriptParseResult;
  onConfirm?: (selectedCourses: CourseCode[]) => Promise<void> | void;
  onCancel?: () => void;
}

interface JevScheduleGlobal {
  window: {
    jevschedule?: {
      completed: {
        set(code: CourseCode, completed: boolean): Promise<void>;
      };
    };
  };
}

function getCompletedApi() {
  const globalWin = globalThis as unknown as JevScheduleGlobal;
  return globalWin.window?.jevschedule?.completed ?? null;
}

export function ImportReviewScreen({
  parseResult = SAMPLE_PARSE_RESULT,
  onConfirm,
  onCancel,
}: ImportReviewScreenProps) {
  const [selectedCodes, setSelectedCodes] = useState<Set<CourseCode>>(() => {
    const initial = new Set<CourseCode>();
    parseResult.parsedCourses.forEach((item) => {
      if (item.selected !== false) {
        initial.add(item.code);
      }
    });
    return initial;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const toggleCourse = (code: CourseCode) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allCodes = new Set(parseResult.parsedCourses.map((c) => c.code));
    setSelectedCodes(allCodes);
  };

  const handleDeselectAll = () => {
    setSelectedCodes(new Set());
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    const selectedList = Array.from(selectedCodes);

    try {
      const api = getCompletedApi();
      if (api) {
        for (const code of selectedList) {
          await api.set(code, true);
        }
      }

      if (onConfirm) {
        await onConfirm(selectedList);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="import-review-container" data-testid="import-review-screen">
      <header className="review-header">
        <h2>Review Imported Courses</h2>
        <p className="review-subtitle">
          Check the parsed courses from your transcript before adding them to your completed
          courses.
        </p>
      </header>

      {error && (
        <p role="alert" className="error-message" data-testid="import-error-message">
          Could not save imported courses. Please try again.
        </p>
      )}

      <section className="parsed-courses-section">
        <div className="section-toolbar">
          <h3>
            Parsed Courses ({selectedCodes.size} / {parseResult.parsedCourses.length} selected)
          </h3>
          <div className="toolbar-buttons">
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={handleSelectAll}
              data-testid="select-all-btn"
            >
              Select All
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleDeselectAll}
              data-testid="deselect-all-btn"
            >
              Deselect All
            </button>
          </div>
        </div>

        <ul className="parsed-courses-list" data-testid="parsed-courses-list">
          {parseResult.parsedCourses.map((item) => {
            const isSelected = selectedCodes.has(item.code);

            return (
              <li key={item.code} className="parsed-course-item">
                <label className="course-checkbox-label">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCourse(item.code)}
                    disabled={saving}
                  />
                  <span className="course-code-badge">{item.code}</span>
                  {item.term && <span className="term-badge">{item.term}</span>}
                  {item.grade && <span className="grade-badge">Grade: {item.grade}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {parseResult.unrecognizedLines.length > 0 && (
        <section className="unrecognized-lines-section" data-testid="unrecognized-section">
          <h3>Unrecognized Lines ({parseResult.unrecognizedLines.length})</h3>
          <p className="unrecognized-help">
            The following lines from your transcript could not be automatically matched to catalog
            courses:
          </p>
          <ul className="unrecognized-list">
            {parseResult.unrecognizedLines.map((line, idx) => (
              <li key={idx} className="unrecognized-item">
                <code>{line}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="review-actions">
        <button
          type="button"
          className="btn btn-primary btn-confirm"
          onClick={handleConfirm}
          disabled={saving || selectedCodes.size === 0}
          data-testid="confirm-import-btn"
        >
          {saving ? "Saving…" : "Confirm & Import Courses"}
        </button>
        {onCancel && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={saving}
            data-testid="cancel-import-btn"
          >
            Cancel
          </button>
        )}
      </footer>
    </div>
  );
}
