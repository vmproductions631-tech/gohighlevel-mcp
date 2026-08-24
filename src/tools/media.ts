import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Media Library: list files, add a hosted file by URL, and delete files. */
export function registerMediaTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_media",
    {
      title: "List media files",
      description:
        "List files/folders in the location's Media Library with pagination, search, " +
        "and optional type filter.",
      inputSchema: {
        locationId,
        query: z.string().optional().describe("Search by file name."),
        type: z
          .enum(["file", "folder"])
          .default("file")
          .describe("Whether to list files or folders (required by GHL)."),
        sortBy: z.string().default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          altId: resolveLocationId(args.locationId),
          altType: "location",
          query: args.query,
          type: args.type ?? "file",
          sortBy: args.sortBy ?? "createdAt",
          sortOrder: args.sortOrder ?? "desc",
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
        };
        return ok(await ghlRequest("/medias/files", { query }));
      }),
  );

  server.registerTool(
    "ghl_upload_media_by_url",
    {
      title: "Upload media by URL",
      description:
        "Add a file to the Media Library by referencing a publicly reachable URL " +
        "(GHL fetches and hosts it). Good for deliverables or talent photos already " +
        "available at a link. For raw binary uploads use the GHL UI.",
      inputSchema: {
        locationId,
        fileUrl: z.string().url().describe("Publicly accessible URL of the file."),
        name: z.string().optional().describe("Name to store the file as."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          altId: resolveLocationId(args.locationId),
          altType: "location",
          fileUrl: args.fileUrl,
          hosted: true,
        };
        if (args.name) body.name = args.name;
        return ok(await ghlRequest("/medias/upload-file", { method: "POST", body }));
      }),
  );

  server.registerTool(
    "ghl_delete_media",
    {
      title: "Delete media file",
      description: "Delete a file from the Media Library. Destructive.",
      inputSchema: { locationId, fileId: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/medias/${args.fileId}`, {
          method: "DELETE",
          query: { altId: resolveLocationId(args.locationId), altType: "location" },
        });
        return ok(data ?? { deleted: true, fileId: args.fileId });
      }),
  );
}
