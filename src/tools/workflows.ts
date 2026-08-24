import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/**
 * GoHighLevel's API cannot CREATE workflow/automation logic — that is UI-only.
 * What the API supports, and what these tools expose, is:
 *   - listing existing workflows
 *   - enrolling / removing a contact from a workflow (i.e. triggering automations)
 */
export function registerWorkflowTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_workflows",
    {
      title: "List workflows",
      description:
        "List the automation workflows configured in a location. Note: workflows " +
        "must be built in the GoHighLevel UI; the API cannot create them. Use the " +
        "returned workflow ids with ghl_add_contact_to_workflow to trigger automations.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest("/workflows/", {
          query: { locationId: resolveLocationId(args.locationId) },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_add_contact_to_workflow",
    {
      title: "Add contact to workflow",
      description:
        "Enroll a contact into an automation workflow, triggering it for that contact. " +
        "Use ghl_list_workflows to find workflowId.",
      inputSchema: {
        contactId: z.string(),
        workflowId: z.string(),
        eventStartTime: z
          .string()
          .optional()
          .describe("Optional ISO 8601 time to start the workflow."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {};
        if (args.eventStartTime) body.eventStartTime = args.eventStartTime;
        const data = await ghlRequest(
          `/contacts/${args.contactId}/workflow/${args.workflowId}`,
          { method: "POST", body },
        );
        return ok(data ?? { added: true });
      }),
  );

  server.registerTool(
    "ghl_remove_contact_from_workflow",
    {
      title: "Remove contact from workflow",
      description: "Remove a contact from an automation workflow, halting it for them.",
      inputSchema: {
        contactId: z.string(),
        workflowId: z.string(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(
          `/contacts/${args.contactId}/workflow/${args.workflowId}`,
          { method: "DELETE" },
        );
        return ok(data ?? { removed: true });
      }),
  );
}
