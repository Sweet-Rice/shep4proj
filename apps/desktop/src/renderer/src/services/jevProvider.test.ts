import { describe, expect, it, vi } from "vitest";
import { JevProviderService } from "./jevProvider.js";

describe("JevProviderService", () => {
  it("initializes with default mock configuration", () => {
    const service = new JevProviderService();
    const config = service.getConfig();

    expect(config.baseUrl).toBe("https://api.jev.ai/v1");
    expect(config.model).toBe("jev-advisor-v1");
    expect(config.useMock).toBe(true);
  });

  it("generates mock suggestions in mock mode", async () => {
    const service = new JevProviderService({ useMock: true });
    const response = await service.generateSuggestion(["CSC 1350"]);

    expect(response.message).toContain("CSC 1350");
    expect(response.message).toContain("CSC 1351");
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls?.[0]?.name).toBe("get_degree_progress");
  });

  it("calls fetch with bearer authorization and tool schemas in live mode", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Live suggestion from Jev AI.",
              tool_calls: [
                {
                  id: "call_live_123",
                  function: { name: "get_degree_progress", arguments: "{}" },
                },
              ],
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const service = new JevProviderService({
      useMock: false,
      apiKey: "test-jev-key-123",
    });

    const response = await service.generateSuggestion(["CSC 1350"]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.jev.ai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-jev-key-123",
        }),
      }),
    );

    expect(response.message).toBe("Live suggestion from Jev AI.");
    expect(response.toolCalls?.[0]?.id).toBe("call_live_123");

    vi.unstubAllGlobals();
  });
});
