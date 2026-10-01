import { useState } from "react";
import type { CourseCode } from "@jevschedule/shared";
import type { TranscriptParseResult as PdfParseResult } from "@jevschedule/workday";
import {
  ImportReviewScreen,
  SAMPLE_PARSE_RESULT,
  type TranscriptParseResult,
} from "./ImportReviewScreen.js";
import { toTranscriptReview } from "./transcript-review.js";

export type ImportStage =
  "idle" | "signing_in" | "fetching" | "uploading" | "review" | "done" | "failure";

function transcriptApi(): { select(): Promise<PdfParseResult | null> } | null {
  const globalWindow = globalThis as typeof globalThis & {
    window?: { jevschedule?: { transcript?: { select(): Promise<PdfParseResult | null> } } };
  };
  return globalWindow.window?.jevschedule?.transcript ?? null;
}

export interface ImportProgressFlowProps {
  initialStage?: ImportStage;
  parseResult?: TranscriptParseResult;
  onImportComplete?: (courses: CourseCode[]) => void;
  onFallbackUpload?: () => void;
  /** Hide unfinished direct-import demo controls in the installed app. */
  uploadOnly?: boolean;
}

export function ImportProgressFlow({
  initialStage = "idle",
  parseResult = SAMPLE_PARSE_RESULT,
  onImportComplete,
  onFallbackUpload,
  uploadOnly = false,
}: ImportProgressFlowProps) {
  const [stage, setStage] = useState<ImportStage>(initialStage);
  const [importedCourses, setImportedCourses] = useState<CourseCode[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedResult, setUploadedResult] = useState<TranscriptParseResult | null>(null);

  const selectTranscript = async () => {
    onFallbackUpload?.();
    const api = transcriptApi();
    if (!api) {
      setErrorMessage("Transcript upload is available in the desktop app.");
      setStage("failure");
      return;
    }
    const previousStage = stage;
    setStage("uploading");
    setErrorMessage(null);
    try {
      const result = await api.select();
      if (result === null) {
        setStage(previousStage);
        return;
      }
      setUploadedResult(toTranscriptReview(result));
      setStage("review");
    } catch {
      setErrorMessage("Could not read this transcript PDF. Try another PDF.");
      setStage("failure");
    }
  };

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
          <p>
            {uploadOnly
              ? "Select a PDF transcript, then review the completed courses before saving them."
              : "Import your completed courses directly from Workday or via transcript review."}
          </p>
          <div className="flow-actions">
            {!uploadOnly && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={startWorkdayImport}
                data-testid="start-import-btn"
              >
                Start Workday Import
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void selectTranscript()}
              data-testid="select-transcript-btn"
            >
              Select Transcript PDF
            </button>
            {!uploadOnly && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={simulateFailure}
                data-testid="simulate-failure-btn"
              >
                Simulate Failure
              </button>
            )}
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

      {stage === "uploading" && (
        <div className="flow-card progress-card" data-testid="stage-uploading">
          <div className="spinner" role="status" aria-label="Loading" />
          <h3>Reading transcript PDF…</h3>
        </div>
      )}

      {stage === "review" && (
        <div className="flow-card review-card" data-testid="stage-review">
          <ImportReviewScreen
            parseResult={uploadedResult ?? parseResult}
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
              onClick={() => void selectTranscript()}
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
