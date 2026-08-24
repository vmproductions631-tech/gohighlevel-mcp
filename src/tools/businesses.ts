import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Businesses: B2B company records that contacts can be associated with. */
export function registerBusinessTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_businesses",
    {
      title: "List businesses",
      description: "List business (company) records in a location.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest("/businesses/", {
            query: { locationId: resolveLocationId(args.locationId) },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_get_business",
    {
      title: "Get business",
      description: "Fetch a single business record by id.",
      inputSchema: { businessId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(await ghlRequest(`/businesses/${args.businessId}`));
      }),
  );

  server.registerTool(
    "ghl_create_business",
    {
      title: "Create business",
      description: "Create a business (company) record.",
      inputSchema: {
        locationId,
        name: z.string(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const { locationId: loc, ...rest } = args;
        const body: Record<string, unknown> = {
          locationId: resolveLocationId(loc),
        };
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        return ok(await ghlRequest("/businesses/", { method: "POST", body }));
      }),
  );

  server.registerTool(
    "ghl_update_business",
    {
      title: "Update business",
      description: "Update a business record. Only provided fields change.",
      inputSchema: {
        businessId: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const { businessId, ...rest } = args;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        return ok(
          await ghlRequest(`/businesses/${businessId}`, { method: "PUT", body }),
        );
      }),
  );

  server.registerTool(
    "ghl_delete_business",
    {
      title: "Delete business",
      description: "Delete a business record. Destructive.",
      inputSchema: { businessId: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/businesses/${args.businessId}`, {
          method: "DELETE",
        });
        return ok(data ?? { deleted: true, businessId: args.businessId });
      }),
  );
}
