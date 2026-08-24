import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Location tag management (the master tag list, distinct from tags on a contact). */
export function registerTagTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_tags",
    {
      title: "List tags",
      description: "List all tags defined in a location.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        return ok(await ghlRequest(`/locations/${loc}/tags`));
      }),
  );

  server.registerTool(
    "ghl_create_tag",
    {
      title: "Create tag",
      description: "Create a new tag in the location's master tag list.",
      inputSchema: { locationId, name: z.string() },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        return ok(
          await ghlRequest(`/locations/${loc}/tags`, {
            method: "POST",
            body: { name: args.name },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_update_tag",
    {
      title: "Update tag",
      description: "Rename an existing tag.",
      inputSchema: { locationId, tagId: z.string(), name: z.string() },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        return ok(
          await ghlRequest(`/locations/${loc}/tags/${args.tagId}`, {
            method: "PUT",
            body: { name: args.name },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_delete_tag",
    {
      title: "Delete tag",
      description: "Delete a tag from the location. Destructive: removes it from records.",
      inputSchema: { locationId, tagId: z.string() },
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
        const data = await ghlRequest(`/locations/${loc}/tags/${args.tagId}`, {
          method: "DELETE",
        });
        return ok(data ?? { deleted: true, tagId: args.tagId });
      }),
  );
}
