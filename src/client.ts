/**
 * Thin HTTP client for the GoHighLevel API v2.
 *
 * Auth: a Location-level "Private Integration" token (Bearer).
 * Base URL: https://services.leadconnectorhq.com
 * Every v2 request must send the `Version` header.
 */

const BASE_URL =
  process.env.GHL_BASE_URL ?? "https://services.leadconnectorhq.com";
const API_VERSION = process.env.GHL_API_VERSION ?? "2021-07-28";

export class GhlError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "GhlError";
  }
}

function getToken(): string {
  const token = process.env.GHL_API_KEY;
  if (!token) {
    throw new GhlError(
      "Missing GHL_API_KEY. Set it to your GoHighLevel Private Integration token " +
        "(Settings → Private Integrations → create a token with the scopes you need).",
    );
  }
  return token;
}

/** The default Location ID, used when a tool does not receive one explicitly. */
export function defaultLocationId(): string | undefined {
  return process.env.GHL_LOCATION_ID || undefined;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Query string params; undefined/null values are skipped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON request body. */
  body?: unknown;
}

/**
 * Make an authenticated request to the GHL API and return parsed JSON.
 * Throws GhlError with an actionable message on non-2xx responses.
 */
export async function ghlRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", query, body } = options;

  const url = new URL(path.startsWith("http") ? path : `${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    Version: API_VERSION,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new GhlError(
      `Network error calling GoHighLevel: ${(err as Error).message}. ` +
        `Check connectivity and that GHL_BASE_URL is correct.`,
    );
  }

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const detail =
      typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed)
        : String(parsed ?? "");
    let hint = "";
    if (res.status === 401) {
      hint =
        " — token is invalid or expired. Regenerate your Private Integration token.";
    } else if (res.status === 403) {
      hint =
        " — token lacks the required scope for this endpoint. Add the scope in Private Integrations settings.";
    } else if (res.status === 404) {
      hint = " — resource not found. Check the id and locationId.";
    } else if (res.status === 422) {
      hint = " — validation error. Check required fields in the request body.";
    } else if (res.status === 429) {
      hint = " — rate limited. Retry after a short delay.";
    }
    throw new GhlError(
      `GoHighLevel API ${res.status} ${res.statusText} for ${method} ${path}${hint} ${detail}`.trim(),
      res.status,
      parsed,
    );
  }

  return parsed as T;
}

/** Resolve a locationId from an explicit arg or the configured default. */
export function resolveLocationId(explicit?: string): string {
  const loc = explicit || defaultLocationId();
  if (!loc) {
    throw new GhlError(
      "No locationId provided and GHL_LOCATION_ID is not set. " +
        "Pass locationId, or set GHL_LOCATION_ID in the server environment.",
    );
  }
  return loc;
}
