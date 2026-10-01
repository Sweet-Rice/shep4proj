export type ProviderType = "qwen" | "jev" | "mock";

export interface ModelProviderSettings {
  activeProvider: ProviderType;
  qwenBaseUrl: string;
  qwenModel: string;
  jevBaseUrl: string;
  jevApiKey: string;
}

export const DEFAULT_PROVIDER_SETTINGS: ModelProviderSettings = {
  activeProvider: "mock",
  qwenBaseUrl: "http://localhost:11434/v1",
  qwenModel: "qwen2.5-coder",
  jevBaseUrl: "https://api.jev.ai/v1",
  jevApiKey: "",
};

export function validateProviderSettings(settings: ModelProviderSettings): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (settings.activeProvider === "qwen") {
    if (!settings.qwenBaseUrl.trim()) {
      errors.push("Qwen base URL cannot be empty.");
    }
    if (!settings.qwenModel.trim()) {
      errors.push("Qwen model name cannot be empty.");
    }
  } else if (settings.activeProvider === "jev") {
    if (!settings.jevBaseUrl.trim()) {
      errors.push("Jev base URL cannot be empty.");
    }
    if (!settings.jevApiKey.trim()) {
      errors.push("Jev API key is required when Jev provider is selected.");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
