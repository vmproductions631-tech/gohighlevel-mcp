import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/**
 * Custom Objects: define structured record types beyond contacts (e.g. "Podcast
 * Episodes", "Productions") and CRUD their records. schemaKey looks like
 * "custom_objects.podcast_episode".
 */
export function registerObjectTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_object_schemas",
    {
      title: "List custom object schemas",
      description:
        "List the custom object (and standard object) schemas defined in a location. " +
        "Use the returned schema key with the record tools.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest("/objects/", {
            query: { locationId: resolveLocationId(args.locationId) },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_get_object_schema",
    {
      title: "Get custom object schema",
      description:
        "Fetch a custom object schema by key (e.g. custom_objects.podcast_episode), " +
        "including its properties.",
      inputSchema: {
        locationId,
        schemaKey: z.string().describe("Object key, e.g. custom_objects.podcast_episode."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest(`/objects/${args.schemaKey}`, {
            query: {
              locationId: resolveLocationId(args.locationId),
              fetchProperties: true,
            },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_search_object_records",
    {
      title: "Search custom object records",
      description: "Search records of a custom object by a text query.",
      inputSchema: {
        locationId,
        schemaKey: z.string(),
        query: z.string().optional().describe("Free-text search."),
        limit: z.number().int().min(1).max(100).default(20),
        skip: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          locationId: resolveLocationId(args.locationId),
          page: Math.floor((args.skip ?? 0) / (args.limit ?? 20)) + 1,
          pageLimit: args.limit ?? 20,
        };
        if (args.query) body.query = args.query;
        return ok(
          await ghlRequest(`/objects/${args.schemaKey}/records/search`, {
            method: "POST",
            body,
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_get_object_record",
    {
      title: "Get custom object record",
      description: "Fetch a single custom object record by id.",
      inputSchema: { locationId, schemaKey: z.string(), recordId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest(`/objects/${args.schemaKey}/records/${args.recordId}`, {
            query: { locationId: resolveLocationId(args.locationId) },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_create_object_record",
    {
      title: "Create custom object record",
      description:
        "Create a record for a custom object. properties is a key/value map matching " +
        "the schema's property keys.",
      inputSchema: {
        locationId,
        schemaKey: z.string(),
        properties: z
          .record(z.string(), z.unknown())
          .describe("Property key/value map for the record."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest(`/objects/${args.schemaKey}/records`, {
            method: "POST",
            body: {
              locationId: resolveLocationId(args.locationId),
              properties: args.properties,
            },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_update_object_record",
    {
      title: "Update custom object record",
      description: "Update a custom object record's properties.",
      inputSchema: {
        locationId,
        schemaKey: z.string(),
        recordId: z.string(),
        properties: z.record(z.string(), z.unknown()),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest(`/objects/${args.schemaKey}/records/${args.recordId}`, {
            method: "PUT",
            body: {
              locationId: resolveLocationId(args.locationId),
              properties: args.properties,
            },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_delete_object_record",
    {
      title: "Delete custom object record",
      description: "Delete a custom object record. Destructive.",
      inputSchema: { locationId, schemaKey: z.string(), recordId: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(
          `/objects/${args.schemaKey}/records/${args.recordId}`,
          {
            method: "DELETE",
            query: { locationId: resolveLocationId(args.locationId) },
          },
        );
        return ok(data ?? { deleted: true, recordId: args.recordId });
      }),
  );
}
