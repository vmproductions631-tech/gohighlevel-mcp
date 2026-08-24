import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Users & Teams: discover user ids for assigning tasks, opportunities, and appointments. */
export function registerUserTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_users",
    {
      title: "List users",
      description:
        "List users (team members) in a location. Use the returned ids as assignedTo / " +
        "assignedUserId values when creating tasks, opportunities, or appointments.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest("/users/", {
            query: { locationId: resolveLocationId(args.locationId) },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_get_user",
    {
      title: "Get user",
      description: "Fetch a single user by id.",
      inputSchema: { userId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(await ghlRequest(`/users/${args.userId}`));
      }),
  );
}
