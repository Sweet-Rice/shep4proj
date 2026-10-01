# T-717 Spike: Jev AI Provider Access & Tool-Calling Investigation

This document summarizes the findings from the spike investigating Jev AI provider access, endpoint configuration, authentication storage, and tool-calling format support for the AI Advisor (US-17).

## 1. Endpoint & Authentication

- **Endpoint**: `https://api.jev.ai/v1` (or local OpenAI-compatible base URL for Qwen / mock model).
- **Authentication**: Bearer token authentication via `Authorization: Bearer <token>` header.
- **Credential Security**: Tokens are encrypted and saved locally via Electron `safeStorage` API (`safeStorage.encryptString` / `safeStorage.decryptString`).
- **CI / Mock Model**: CI runs utilize `mock` provider mode to execute full test suites without external network calls.

## 2. Tool-Calling Format

Jev AI provider supports OpenAI-compatible function calling specifications:

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_degree_progress",
        "description": "Returns student degree progress and unsatisfied requirements.",
        "parameters": { "type": "object", "properties": {} }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "get_completed_courses",
        "description": "Returns list of completed courses.",
        "parameters": { "type": "object", "properties": {} }
      }
    }
  ]
}
```

## 3. Integration Recommendations for Issue #119

1. Implement `JevModelProvider` class wrapping `fetch` requests with `safeStorage` token retrieval.
2. Provide `MockModelProvider` fallback in unit and integration tests.
3. Configure settings UI toggle to select between `Qwen` (local OpenAI endpoint), `Jev AI`, and `Mock`.
