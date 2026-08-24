import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Custom Values: account-wide merge fields (e.g. {{custom_values.booking_link}}). */
export function registerCustomValueTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_custom_values",
    {
      title: "List custom values",
      description:
        "List location custom values (reusable merge fields used in templates/messages).",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        return ok(await ghlRequest(`/locations/${loc}/customValues`));
      }),
  );

  server.registerTool(
    "ghl_get_custom_value",
    {
      title: "Get custom value",
      description: "Fetch a single custom value by id.",
      inputSchema: { locationId, customValueId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        return ok(
          await ghlRequest(`/locations/${loc}/customValues/${args.customValueId}`),
        );
      }),
  );

  server.registerTool(
    "ghl_create_custom_value",
    {
      title: "Create custom value",
      description: "Create a new custom value (merge field) with a name and value.",
      inputSchema: { locationId, name: z.string(), value: z.string() },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        return ok(
          await ghlRequest(`/locations/${loc}/customValues`, {
            method: "POST",
            body: { name: args.name, value: args.value },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_update_custom_value",
    {
      title: "Update custom value",
      description: "Update a custom value's name and/or value.",
      inputSchema: {
        locationId,
        customValueId: z.string(),
        name: z.string(),
        value: z.string(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        return ok(
          await ghlRequest(`/locations/${loc}/customValues/${args.customValueId}`, {
            method: "PUT",
            body: { name: args.name, value: args.value },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_delete_custom_value",
    {
      title: "Delete custom value",
      description: "Delete a custom value. Destructive.",
      inputSchema: { locationId, customValueId: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const data = await ghlRequest(
          `/locations/${loc}/customValues/${args.customValueId}`,
          { method: "DELETE" },
        );
        return ok(data ?? { deleted: true, customValueId: args.customValueId });
      }),
  );
}
