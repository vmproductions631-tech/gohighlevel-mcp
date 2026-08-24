import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

const DATA_TYPES = [
  "TEXT",
  "LARGE_TEXT",
  "NUMERICAL",
  "PHONE",
  "MONETORY",
  "CHECKBOX",
  "SINGLE_OPTIONS",
  "MULTIPLE_OPTIONS",
  "DATE",
  "TEXTBOX_LIST",
  "FILE_UPLOAD",
  "RADIO",
] as const;

export function registerCustomFieldTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_custom_fields",
    {
      title: "List custom fields",
      description:
        "List custom field definitions for a location. Filter by model (contact, " +
        "opportunity, or all) to see which fields apply where. Use the returned ids " +
        "when reading/writing custom field values on contacts.",
      inputSchema: {
        locationId,
        model: z
          .enum(["contact", "opportunity", "all"])
          .default("all")
          .describe("Which object's custom fields to return."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const data = await ghlRequest(`/locations/${loc}/customFields`, {
          query: { model: args.model ?? "all" },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_custom_field",
    {
      title: "Get custom field",
      description: "Fetch a single custom field definition by id.",
      inputSchema: {
        locationId,
        customFieldId: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const data = await ghlRequest(
          `/locations/${loc}/customFields/${args.customFieldId}`,
        );
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_custom_field",
    {
      title: "Create custom field",
      description:
        "Create a custom field definition. For option-based types (SINGLE_OPTIONS, " +
        "MULTIPLE_OPTIONS, RADIO, CHECKBOX) provide the options array.",
      inputSchema: {
        locationId,
        name: z.string().describe("Field display name."),
        dataType: z.enum(DATA_TYPES).describe("Field data type."),
        model: z
          .enum(["contact", "opportunity"])
          .default("contact")
          .describe("Object the field attaches to."),
        placeholder: z.string().optional(),
        position: z.number().int().optional(),
        options: z
          .array(z.string())
          .optional()
          .describe("Choice values (required for option-based types)."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const body: Record<string, unknown> = {
          name: args.name,
          dataType: args.dataType,
          model: args.model ?? "contact",
        };
        if (args.placeholder !== undefined) body.placeholder = args.placeholder;
        if (args.position !== undefined) body.position = args.position;
        if (args.options !== undefined) body.options = args.options;
        const data = await ghlRequest(`/locations/${loc}/customFields`, {
          method: "POST",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_update_custom_field",
    {
      title: "Update custom field",
      description: "Update a custom field definition. Only provided fields change.",
      inputSchema: {
        locationId,
        customFieldId: z.string(),
        name: z.string().optional(),
        placeholder: z.string().optional(),
        position: z.number().int().optional(),
        options: z.array(z.string()).optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const { customFieldId, locationId: _loc, ...rest } = args;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await ghlRequest(
          `/locations/${loc}/customFields/${customFieldId}`,
          { method: "PUT", body },
        );
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_delete_custom_field",
    {
      title: "Delete custom field",
      description:
        "Delete a custom field definition. Destructive: removes the field and its " +
        "stored values across records.",
      inputSchema: {
        locationId,
        customFieldId: z.string(),
      },
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
          `/locations/${loc}/customFields/${args.customFieldId}`,
          { method: "DELETE" },
        );
        return ok(data ?? { deleted: true, customFieldId: args.customFieldId });
      }),
  );
}
