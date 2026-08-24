import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Social Planner: list connected accounts, list/create/delete scheduled posts. */
export function registerSocialTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_social_accounts",
    {
      title: "List social accounts",
      description:
        "List the social media accounts connected to the location's Social Planner. " +
        "Use the returned account ids when creating a post.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        return ok(await ghlRequest(`/social-media-posting/${loc}/accounts`));
      }),
  );

  server.registerTool(
    "ghl_list_social_posts",
    {
      title: "List social posts",
      description:
        "List scheduled/published social posts for the location. Optionally filter by " +
        "account ids and a date range (ISO 8601).",
      inputSchema: {
        locationId,
        type: z
          .enum(["all", "scheduled", "published", "draft", "in_review", "failed"])
          .default("all"),
        accountIds: z.array(z.string()).optional(),
        fromDate: z.string().optional().describe("ISO 8601 start."),
        toDate: z.string().optional().describe("ISO 8601 end."),
        limit: z.number().int().min(1).max(100).default(20),
        skip: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const body: Record<string, unknown> = {
          type: args.type ?? "all",
          limit: args.limit ?? 20,
          skip: args.skip ?? 0,
        };
        if (args.accountIds) body.accounts = args.accountIds;
        if (args.fromDate) body.fromDate = args.fromDate;
        if (args.toDate) body.toDate = args.toDate;
        return ok(
          await ghlRequest(`/social-media-posting/${loc}/posts/list`, {
            method: "POST",
            body,
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_get_social_post",
    {
      title: "Get social post",
      description: "Fetch a single social post by id.",
      inputSchema: { locationId, postId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        return ok(await ghlRequest(`/social-media-posting/${loc}/posts/${args.postId}`));
      }),
  );

  server.registerTool(
    "ghl_create_social_post",
    {
      title: "Create social post",
      description:
        "Schedule or publish a social post to one or more connected accounts. Provide " +
        "scheduleDate (ISO 8601) for a scheduled post; omit for an immediate draft per " +
        "status. mediaUrls can include image/video URLs already hosted in GHL.",
      inputSchema: {
        locationId,
        accountIds: z.array(z.string()).min(1).describe("Target social account ids."),
        summary: z.string().describe("Post caption/text."),
        mediaUrls: z
          .array(z.string())
          .optional()
          .describe("URLs of media to attach (e.g. a Reel/clip)."),
        scheduleDate: z
          .string()
          .optional()
          .describe("ISO 8601 time to publish. Omit to create as draft."),
        status: z
          .enum(["draft", "scheduled", "published"])
          .default("scheduled"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const body: Record<string, unknown> = {
          accountIds: args.accountIds,
          summary: args.summary,
          type: args.scheduleDate ? "post" : "post",
          status: args.status ?? "scheduled",
        };
        if (args.mediaUrls) {
          body.media = args.mediaUrls.map((url) => ({ url }));
        }
        if (args.scheduleDate) body.scheduleDate = args.scheduleDate;
        return ok(
          await ghlRequest(`/social-media-posting/${loc}/posts`, {
            method: "POST",
            body,
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_delete_social_post",
    {
      title: "Delete social post",
      description: "Delete a scheduled or draft social post. Destructive.",
      inputSchema: { locationId, postId: z.string() },
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
          `/social-media-posting/${loc}/posts/${args.postId}`,
          { method: "DELETE" },
        );
        return ok(data ?? { deleted: true, postId: args.postId });
      }),
  );
}
