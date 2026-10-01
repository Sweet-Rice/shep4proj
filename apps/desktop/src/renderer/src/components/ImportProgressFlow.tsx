import { useState } from "react";
import type { CourseCode } from "@jevschedule/shared";
import {
  ImportReviewScreen,
  SAMPLE_PARSE_RESULT,
  type TranscriptParseResult,
} from "./ImportReviewScreen.js";

export type ImportStage = "idle" | "signing_in" | "fetching" | "review" | "done" | "failure";

export interface ImportProgressFlowProps {
  initialStage?: ImportStage;
  parseResult?: TranscriptParseResult;
  onImportComplete?: (courses: CourseCode[]) => void;
  onFallbackUpload?: () => void;
}

export function ImportProgressFlow({
  initialStage = "idle",
  parseResult = SAMPLE_PARSE_RESULT,
  onImportComplete,
  onFallbackUpload,
}: ImportProgressFlowProps) {
  const [stage, setStage] = useState<ImportStage>(initialStage);
  const [importedCourses, setImportedCourses] = useState<CourseCode[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startWorkdayImport = () => {
    setStage("signing_in");
    setErrorMessage(null);

    setTimeout(() => {
      setStage("fetching");
      setTimeout(() => {
        setStage("review");
      }, 50);
    }, 50);
  };

  const simulateFailure = () => {
    setStage("signing_in");
    setErrorMessage(null);
    setTimeout(() => {
      setStage("failure");
      setErrorMessage("Unable to sign in or fetch record from Workday.");
    }, 50);
  };

  const handleReviewConfirm = (selectedCourses: CourseCode[]) => {
    setImportedCourses(selectedCourses);
    setStage("done");
    if (onImportComplete) {
      onImportComplete(selectedCourses);
    }
  };

  const handleReviewCancel = () => {
    setStage("idle");
  };

  return (
    <div className="import-progress-flow" data-testid="import-progress-flow">
      {stage === "idle" && (
        <div className="flow-card idle-card" data-testid="stage-idle">
          <h3>Import Academic Record</h3>
          <p>Import your completed courses directly from Workday or via transcript review.</p>
          <div className="flow-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={startWorkdayImport}
              data-testid="start-import-btn"
            >
              Start Workday Import
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={simulateFailure}
              data-testid="simulate-failure-btn"
            >
              Simulate Failure
            </button>
          </div>
        </div>
      )}

      {stage === "signing_in" && (
        <div className="flow-card progress-card" data-testid="stage-signing-in">
          <div className="spinner" role="status" aria-label="Loading" />
          <h3>Signing in to Workday…</h3>
          <p>Please wait while we establish a secure connection.</p>
        </div>
      )}

      {stage === "fetching" && (
        <div className="flow-card progress-card" data-testid="stage-fetching">
          <div className="spinner" role="status" aria-label="Loading" />
          <h3>Fetching Academic Record…</h3>
          <p>Retrieving your completed courses and transcript history.</p>
        </div>
      )}

      {stage === "review" && (
        <div className="flow-card review-card" data-testid="stage-review">
          <ImportReviewScreen
            parseResult={parseResult}
            onConfirm={handleReviewConfirm}
            onCancel={handleReviewCancel}
          />
        </div>
      )}

      {stage === "done" && (
        <div className="flow-card success-card" data-testid="stage-done">
          <div className="success-icon" aria-hidden="true">
            ✓
          </div>
          <h3>Import Complete!</h3>
          <p data-testid="done-summary">
            Successfully imported {importedCourses.length} completed course
            {importedCourses.length === 1 ? "" : "s"}.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStage("idle")}
            data-testid="finish-btn"
          >
            Done
          </button>
        </div>
      )}

      {stage === "failure" && (
        <div className="flow-card failure-card" data-testid="stage-failure">
          <div className="error-icon" aria-hidden="true">
            ⚠
          </div>
          <h3>Import Failed</h3>
          <p role="alert" className="failure-message" data-testid="failure-message">
            {errorMessage || "An unexpected error occurred during direct import."}
          </p>
          <div className="flow-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onFallbackUpload}
              data-testid="upload-instead-btn"
            >
              Upload Transcript Instead
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={startWorkdayImport}
              data-testid="try-again-btn"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
