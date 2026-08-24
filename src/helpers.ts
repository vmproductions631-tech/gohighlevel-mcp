import { GhlError } from "./client.js";

/** MCP tool result shape. The index signature keeps it assignable to the SDK's CallToolResult. */
export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Wrap a successful JSON payload as an MCP tool result. */
export function ok(data: unknown): ToolResult {
  const text =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const result: ToolResult = {
    content: [{ type: "text", text }],
  };
  if (data && typeof data === "object" && !Array.isArray(data)) {
    result.structuredContent = data as Record<string, unknown>;
  } else {
    result.structuredContent = { result: data };
  }
  return result;
}

/** Wrap an error as an MCP tool result (isError so the model can react). */
export function fail(err: unknown): ToolResult {
  const message =
    err instanceof GhlError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

/** Run an async tool body, converting thrown errors into a fail() result. */
export async function run(
  fn: () => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    return fail(err);
  }
}
