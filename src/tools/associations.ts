import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/**
 * Associations: define and create relationships between records (e.g. link a
 * "Production" custom object record to a contact).
 */
export function registerAssociationTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_associations",
    {
      title: "List associations",
      description:
        "List association definitions in a location (the relationship types available " +
        "between record kinds).",
      inputSchema: {
        locationId,
        limit: z.number().int().min(1).max(100).default(20),
        skip: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          limit: args.limit ?? 20,
          skip: args.skip ?? 0,
        };
        return ok(await ghlRequest("/associations/", { query }));
      }),
  );

  server.registerTool(
    "ghl_get_record_relations",
    {
      title: "Get record relations",
      description: "List the relations a given record participates in.",
      inputSchema: {
        locationId,
        recordId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
        skip: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          limit: args.limit ?? 20,
          skip: args.skip ?? 0,
        };
        return ok(
          await ghlRequest(`/associations/relations/${args.recordId}`, { query }),
        );
      }),
  );

  server.registerTool(
    "ghl_create_relation",
    {
      title: "Create relation",
      description:
        "Create a relation between two records using an association definition. Get " +
        "associationId from ghl_list_associations.",
      inputSchema: {
        locationId,
        associationId: z.string(),
        firstRecordId: z.string(),
        secondRecordId: z.string(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest("/associations/relations", {
            method: "POST",
            body: {
              locationId: resolveLocationId(args.locationId),
              associationId: args.associationId,
              firstRecordId: args.firstRecordId,
              secondRecordId: args.secondRecordId,
            },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_delete_relation",
    {
      title: "Delete relation",
      description: "Delete a relation between two records. Destructive.",
      inputSchema: { locationId, relationId: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/associations/relations/${args.relationId}`, {
          method: "DELETE",
          query: { locationId: resolveLocationId(args.locationId) },
        });
        return ok(data ?? { deleted: true, relationId: args.relationId });
      }),
  );
}
