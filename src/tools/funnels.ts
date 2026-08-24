import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Funnels & Pages: list funnels and their pages (read-only). */
export function registerFunnelTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_funnels",
    {
      title: "List funnels",
      description:
        "List funnels in a location. Optionally filter by type, category, or name.",
      inputSchema: {
        locationId,
        type: z.string().optional().describe("Funnel type filter."),
        category: z.string().optional(),
        name: z.string().optional().describe("Filter by funnel name."),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          type: args.type,
          category: args.category,
          name: args.name,
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
        };
        return ok(await ghlRequest("/funnels/funnel/list", { query }));
      }),
  );

  server.registerTool(
    "ghl_list_funnel_pages",
    {
      title: "List funnel pages",
      description: "List the pages within a funnel.",
      inputSchema: {
        locationId,
        funnelId: z.string(),
        name: z.string().optional().describe("Filter by page name."),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          funnelId: args.funnelId,
          name: args.name,
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
        };
        return ok(await ghlRequest("/funnels/page", { query }));
      }),
  );
}
