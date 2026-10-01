import type { CourseCode } from "@jevschedule/shared";

export interface JevProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  useMock?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface JevResponse {
  message: string;
  toolCalls?: ToolCall[];
}

export const DEFAULT_JEV_CONFIG: JevProviderConfig = {
  baseUrl: "https://api.jev.ai/v1",
  model: "jev-advisor-v1",
  useMock: true,
};

export class JevProviderService {
  private config: JevProviderConfig;

  constructor(config: Partial<JevProviderConfig> = {}) {
    this.config = { ...DEFAULT_JEV_CONFIG, ...config };
  }

  public getConfig(): JevProviderConfig {
    return { ...this.config };
  }

  public async generateSuggestion(
    completedCourses: CourseCode[],
    prompt = "Suggest my next semester courses.",
  ): Promise<JevResponse> {
    if (this.config.useMock || !this.config.apiKey) {
      return this.generateMockSuggestion(completedCourses, prompt);
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: "You are an academic advisor AI helping students plan degree requirements.",
          },
          {
            role: "user",
            content: `${prompt} Completed courses: ${completedCourses.join(", ")}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "get_degree_progress",
              description: "Returns student degree requirement progress.",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Jev provider HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const choice = data.choices[0]?.message;
    return {
      message: choice?.content || "No suggestion generated.",
      toolCalls: choice?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
      })),
    };
  }

  private generateMockSuggestion(completed: CourseCode[], _prompt: string): JevResponse {
    const recommended = ["CSC 1351", "MATH 1552"].filter((c) => !completed.includes(c));

    return {
      message: `Based on your completed courses (${completed.join(", ")}), we recommend taking: ${recommended.join(", ")}.`,
      toolCalls: [
        {
          id: "call_mock_1",
          name: "get_degree_progress",
          arguments: {},
        },
      ],
    };
  }
}
