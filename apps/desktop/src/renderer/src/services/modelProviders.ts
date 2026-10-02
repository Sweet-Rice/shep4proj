export type ProviderType = "qwen" | "mock";

export interface ModelProviderSettings {
  activeProvider: ProviderType;
  qwenBaseUrl: string;
  qwenModel: string;
}

export const DEFAULT_PROVIDER_SETTINGS: ModelProviderSettings = {
  activeProvider: "mock",
  qwenBaseUrl: "http://localhost:11434/v1",
  qwenModel: "qwen2.5-coder",
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
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
