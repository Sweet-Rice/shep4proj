import type { ModelProviderSettings } from "../services/modelProviders.js";
import { useModelProviders } from "../hooks/useModelProviders.js";

export interface ModelProviderSettingsViewProps {
  initialSettings?: ModelProviderSettings;
  onSaveSettings?: (settings: ModelProviderSettings) => void;
}

export function ModelProviderSettingsView({
  initialSettings,
  onSaveSettings,
}: ModelProviderSettingsViewProps) {
  const {
    settings,
    setActiveProvider,
    updateQwenSettings,
    updateJevSettings,
    isValid,
    validationErrors,
  } = useModelProviders(initialSettings);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && onSaveSettings) {
      onSaveSettings(settings);
    }
  };

  return (
    <div className="model-provider-settings-container" data-testid="model-provider-settings">
      <header className="settings-header">
        <h2>AI Model Provider Settings</h2>
        <p className="settings-subtitle">
          Select and configure the AI model provider used for semester suggestions.
        </p>
      </header>

      <form className="settings-form" onSubmit={handleSave}>
        <div className="form-group provider-selection-group">
          <label className="group-label">Active Provider</label>
          <div className="radio-group" role="radiogroup" aria-label="Active AI Provider">
            <label className="radio-label">
              <input
                type="radio"
                name="provider"
                value="mock"
                checked={settings.activeProvider === "mock"}
                onChange={() => setActiveProvider("mock")}
                data-testid="provider-mock-radio"
              />
              <span>Mock Model (CI & Offline Testing)</span>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="provider"
                value="qwen"
                checked={settings.activeProvider === "qwen"}
                onChange={() => setActiveProvider("qwen")}
                data-testid="provider-qwen-radio"
              />
              <span>Local Qwen (OpenAI-compatible)</span>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="provider"
                value="jev"
                checked={settings.activeProvider === "jev"}
                onChange={() => setActiveProvider("jev")}
                data-testid="provider-jev-radio"
              />
              <span>Jev AI Provider</span>
            </label>
          </div>
        </div>

        {settings.activeProvider === "qwen" && (
          <div className="provider-subpanel qwen-panel" data-testid="qwen-settings-panel">
            <h4>Local Qwen Configuration</h4>
            <div className="form-group">
              <label htmlFor="qwen-base-url">Base URL</label>
              <input
                id="qwen-base-url"
                type="url"
                className="form-control"
                value={settings.qwenBaseUrl}
                onChange={(e) => updateQwenSettings(e.target.value, settings.qwenModel)}
                placeholder="http://localhost:11434/v1"
                data-testid="qwen-base-url-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="qwen-model-name">Model Name</label>
              <input
                id="qwen-model-name"
                type="text"
                className="form-control"
                value={settings.qwenModel}
                onChange={(e) => updateQwenSettings(settings.qwenBaseUrl, e.target.value)}
                placeholder="qwen2.5-coder"
                data-testid="qwen-model-input"
              />
            </div>
          </div>
        )}

        {settings.activeProvider === "jev" && (
          <div className="provider-subpanel jev-panel" data-testid="jev-settings-panel">
            <h4>Jev AI Configuration</h4>
            <div className="form-group">
              <label htmlFor="jev-base-url">Base URL</label>
              <input
                id="jev-base-url"
                type="url"
                className="form-control"
                value={settings.jevBaseUrl}
                onChange={(e) => updateJevSettings(e.target.value, settings.jevApiKey)}
                placeholder="https://api.jev.ai/v1"
                data-testid="jev-base-url-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="jev-api-key">API Credentials (Stored in safeStorage)</label>
              <input
                id="jev-api-key"
                type="password"
                className="form-control"
                value={settings.jevApiKey}
                onChange={(e) => updateJevSettings(settings.jevBaseUrl, e.target.value)}
                placeholder="Enter Jev API key…"
                data-testid="jev-api-key-input"
              />
            </div>
          </div>
        )}

        {!isValid && (
          <div className="validation-error-box" role="alert" data-testid="validation-errors">
            <ul>
              {validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isValid}
            data-testid="save-provider-settings-btn"
          >
            Save Provider Settings
          </button>
        </div>
      </form>
    </div>
  );
}
