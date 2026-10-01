import { useCallback, useState } from "react";
import {
  DEFAULT_PROVIDER_SETTINGS,
  type ModelProviderSettings,
  type ProviderType,
  validateProviderSettings,
} from "../services/modelProviders.js";

export function useModelProviders(
  initialSettings: ModelProviderSettings = DEFAULT_PROVIDER_SETTINGS,
) {
  const [settings, setSettings] = useState<ModelProviderSettings>(initialSettings);

  const setActiveProvider = useCallback((activeProvider: ProviderType) => {
    setSettings((prev) => ({ ...prev, activeProvider }));
  }, []);

  const updateQwenSettings = useCallback((qwenBaseUrl: string, qwenModel: string) => {
    setSettings((prev) => ({ ...prev, qwenBaseUrl, qwenModel }));
  }, []);

  const updateJevSettings = useCallback((jevBaseUrl: string, jevApiKey: string) => {
    setSettings((prev) => ({ ...prev, jevBaseUrl, jevApiKey }));
  }, []);

  const validation = validateProviderSettings(settings);

  return {
    settings,
    setSettings,
    setActiveProvider,
    updateQwenSettings,
    updateJevSettings,
    isValid: validation.isValid,
    validationErrors: validation.errors,
  };
}
