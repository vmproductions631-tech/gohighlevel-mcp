import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

export function registerOpportunityTools(server: McpServer): void {
  server.registerTool(
    "ghl_get_pipelines",
    {
      title: "List pipelines",
      description:
        "List all opportunity pipelines and their stages for a location. Use this " +
        "to discover pipelineId and pipelineStageId values needed by other tools.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest("/opportunities/pipelines", {
          query: { locationId: resolveLocationId(args.locationId) },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_search_opportunities",
    {
      title: "Search opportunities",
      description:
        "Search opportunities (deals) in a location. Filter by pipeline, stage, " +
        "status, assigned user, or free-text query.",
      inputSchema: {
        locationId,
        query: z.string().optional().describe("Free-text search."),
        pipelineId: z.string().optional(),
        pipelineStageId: z.string().optional(),
        status: z
          .enum(["open", "won", "lost", "abandoned", "all"])
          .optional()
          .describe("Opportunity status filter."),
        assignedTo: z.string().optional().describe("Assigned user id."),
        contactId: z.string().optional().describe("Filter to a single contact's deals."),
        limit: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          location_id: resolveLocationId(args.locationId),
          q: args.query,
          pipeline_id: args.pipelineId,
          pipeline_stage_id: args.pipelineStageId,
          status: args.status,
          assigned_to: args.assignedTo,
          contact_id: args.contactId,
          limit: args.limit ?? 20,
          page: args.page ?? 1,
        };
        const data = await ghlRequest("/opportunities/search", { query });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_opportunity",
    {
      title: "Get opportunity",
      description: "Fetch a single opportunity (deal) by id.",
      inputSchema: { opportunityId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/opportunities/${args.opportunityId}`);
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_opportunity",
    {
      title: "Create opportunity",
      description:
        "Create a new opportunity (deal) in a pipeline stage. Use ghl_get_pipelines " +
        "first to obtain valid pipelineId and pipelineStageId values.",
      inputSchema: {
        locationId,
        pipelineId: z.string().describe("Target pipeline id."),
        pipelineStageId: z.string().describe("Target stage id within the pipeline."),
        name: z.string().describe("Opportunity name/title."),
        contactId: z.string().describe("Contact this opportunity belongs to."),
        status: z
          .enum(["open", "won", "lost", "abandoned"])
          .default("open")
          .describe("Initial status."),
        monetaryValue: z.number().optional().describe("Deal value in account currency."),
        assignedTo: z.string().optional().describe("User id to assign."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          locationId: resolveLocationId(args.locationId),
          pipelineId: args.pipelineId,
          pipelineStageId: args.pipelineStageId,
          name: args.name,
          contactId: args.contactId,
          status: args.status ?? "open",
        };
        if (args.monetaryValue !== undefined) body.monetaryValue = args.monetaryValue;
        if (args.assignedTo) body.assignedTo = args.assignedTo;
        const data = await ghlRequest("/opportunities/", { method: "POST", body });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_update_opportunity",
    {
      title: "Update opportunity",
      description:
        "Update an opportunity: move stage, change status, value, name, or owner. " +
        "Only provided fields are changed.",
      inputSchema: {
        opportunityId: z.string(),
        pipelineId: z.string().optional(),
        pipelineStageId: z.string().optional().describe("Move the deal to this stage."),
        name: z.string().optional(),
        status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
        monetaryValue: z.number().optional(),
        assignedTo: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const { opportunityId, ...rest } = args;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await ghlRequest(`/opportunities/${opportunityId}`, {
          method: "PUT",
          body,
        });
        return ok(data);
      }),
  );
}
