import { useState } from "react";

export interface HarnessSettingsState {
  enabled: boolean;
  bindAddress: string;
  port: number;
  sessionToken: string;
}

export const DEFAULT_HARNESS_SETTINGS: HarnessSettingsState = {
  enabled: false,
  bindAddress: "127.0.0.1",
  port: 3000,
  sessionToken: "sample-session-token",
};

export interface HarnessSettingsViewProps {
  initialSettings?: HarnessSettingsState;
  onToggleServer?: (enabled: boolean) => Promise<void> | void;
  onCopyToken?: (token: string) => void;
}

export function HarnessSettingsView({
  initialSettings = DEFAULT_HARNESS_SETTINGS,
  onToggleServer,
  onCopyToken,
}: HarnessSettingsViewProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const nextState = !enabled;
    setLoading(true);

    try {
      if (onToggleServer) {
        await onToggleServer(nextState);
      }
      setEnabled(nextState);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (onCopyToken) {
      onCopyToken(initialSettings.sessionToken);
    } else if (navigator.clipboard) {
      void navigator.clipboard.writeText(initialSettings.sessionToken);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const serverUrl = `http://${initialSettings.bindAddress}:${initialSettings.port}`;

  return (
    <div className="harness-settings-container" data-testid="harness-settings-view">
      <header className="settings-header">
        <h2>External AI Harness Server</h2>
        <p className="settings-subtitle">
          Expose a secure local endpoint for connecting external AI agents (e.g. Cursor, Claude,
          local LLMs).
        </p>
      </header>

      <section className="server-toggle-section">
        <div className="toggle-row">
          <label className="toggle-label" htmlFor="harness-server-toggle">
            <span className="toggle-title">Enable AI Harness Server</span>
            <span className="toggle-description">
              Starts a local HTTP server bound strictly to 127.0.0.1
            </span>
          </label>
          <input
            id="harness-server-toggle"
            type="checkbox"
            className="toggle-checkbox"
            checked={enabled}
            onChange={handleToggle}
            disabled={loading}
            data-testid="harness-toggle-checkbox"
          />
        </div>

        <div className="server-status-banner" data-testid="server-status-banner">
          <span className={`status-indicator ${enabled ? "running" : "stopped"}`} />
          <span className="status-text" data-testid="server-status-text">
            Server Status: {enabled ? `Running on ${serverUrl}` : "Stopped"}
          </span>
        </div>
      </section>

      {enabled && (
        <div className="harness-details-panel" data-testid="harness-details-panel">
          <section className="token-section">
            <h3>Session Access Token</h3>
            <p className="section-help">
              Include this Bearer token in the <code>Authorization</code> header of external
              requests.
            </p>
            <div className="token-input-group">
              <input
                type="text"
                readOnly
                value={initialSettings.sessionToken}
                className="token-display-input"
                data-testid="token-display-input"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCopy}
                data-testid="copy-token-btn"
              >
                {copied ? "Copied!" : "Copy Token"}
              </button>
            </div>
          </section>

          <section className="instructions-section">
            <h3>Connection Instructions</h3>
            <ol className="instructions-list">
              <li>
                Configure your external AI agent or plugin with Base URL: <code>{serverUrl}</code>
              </li>
              <li>
                Add HTTP Header: <code>Authorization: Bearer {initialSettings.sessionToken}</code>
              </li>
              <li>
                Use available REST endpoints to fetch degree requirements and update planned
                courses.
              </li>
            </ol>
          </section>

          <section className="exposed-data-section">
            <h3>Exposed Data & Privacy Scope</h3>
            <ul className="privacy-scope-list" data-testid="exposed-data-list">
              <li>
                <span className="scope-icon read-only">R</span>
                <strong>Completed Courses & Grades:</strong> Read-only access to course completion
                history.
              </li>
              <li>
                <span className="scope-icon read-only">R</span>
                <strong>Degree Requirements:</strong> Read-only access to degree program requirement
                evaluation.
              </li>
              <li>
                <span className="scope-icon read-write">R/W</span>
                <strong>Semester Plan:</strong> Read and update access for semester course
                assignments.
              </li>
              <li>
                <span className="scope-icon forbidden">✕</span>
                <strong>Workday Credentials:</strong> NEVER EXPOSED or accessible to external tools.
              </li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
