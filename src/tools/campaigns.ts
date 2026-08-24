import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Campaigns & Trigger Links. */
export function registerCampaignTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_campaigns",
    {
      title: "List campaigns",
      description:
        "List marketing campaigns in a location. Use a campaign id with " +
        "ghl_add_contact_to_campaign.",
      inputSchema: {
        locationId,
        status: z.string().optional().describe("Filter by status, e.g. published."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | undefined> = {
          locationId: resolveLocationId(args.locationId),
          status: args.status,
        };
        return ok(await ghlRequest("/campaigns/", { query }));
      }),
  );

  server.registerTool(
    "ghl_add_contact_to_campaign",
    {
      title: "Add contact to campaign",
      description: "Enroll a contact into a campaign, starting it for them.",
      inputSchema: { contactId: z.string(), campaignId: z.string() },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(
          `/contacts/${args.contactId}/campaigns/${args.campaignId}`,
          { method: "POST", body: {} },
        );
        return ok(data ?? { added: true });
      }),
  );

  server.registerTool(
    "ghl_remove_contact_from_campaign",
    {
      title: "Remove contact from campaign",
      description: "Remove a contact from a campaign (or all campaigns if no id given).",
      inputSchema: {
        contactId: z.string(),
        campaignId: z
          .string()
          .optional()
          .describe("Campaign to remove from. Omit to remove from all campaigns."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const path = args.campaignId
          ? `/contacts/${args.contactId}/campaigns/${args.campaignId}`
          : `/contacts/${args.contactId}/campaigns/removeAll`;
        const data = await ghlRequest(path, { method: "DELETE" });
        return ok(data ?? { removed: true });
      }),
  );

  server.registerTool(
    "ghl_list_trigger_links",
    {
      title: "List trigger links",
      description: "List trackable trigger links in a location.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest("/links/", {
            query: { locationId: resolveLocationId(args.locationId) },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_create_trigger_link",
    {
      title: "Create trigger link",
      description:
        "Create a trackable trigger link that redirects to a destination URL and can " +
        "fire automations on click.",
      inputSchema: {
        locationId,
        name: z.string(),
        redirectTo: z.string().url().describe("Destination URL."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest("/links/", {
            method: "POST",
            body: {
              locationId: resolveLocationId(args.locationId),
              name: args.name,
              redirectTo: args.redirectTo,
            },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_delete_trigger_link",
    {
      title: "Delete trigger link",
      description: "Delete a trigger link. Destructive.",
      inputSchema: { linkId: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/links/${args.linkId}`, { method: "DELETE" });
        return ok(data ?? { deleted: true, linkId: args.linkId });
      }),
  );
}
