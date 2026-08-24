import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

export function registerContactsTools(server: McpServer): void {
  server.registerTool(
    "ghl_search_contacts",
    {
      title: "Search contacts",
      description:
        "Search/list contacts in a GoHighLevel location. Supports a free-text query " +
        "(matches name, email, phone) and pagination. Returns matching contacts.",
      inputSchema: {
        locationId,
        query: z
          .string()
          .optional()
          .describe("Free-text search across name, email, and phone."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Max contacts to return (1-100)."),
        startAfterId: z
          .string()
          .optional()
          .describe("Contact id to paginate after (from a previous page)."),
        startAfter: z
          .number()
          .optional()
          .describe("Timestamp cursor to paginate after (from a previous page)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          locationId: resolveLocationId(args.locationId),
          pageLimit: args.limit ?? 20,
        };
        if (args.query) body.query = args.query;
        if (args.startAfterId) body.startAfterId = args.startAfterId;
        if (args.startAfter !== undefined) body.startAfter = args.startAfter;
        const data = await ghlRequest("/contacts/search", {
          method: "POST",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_contact",
    {
      title: "Get contact",
      description: "Fetch a single contact by id, including custom fields and tags.",
      inputSchema: {
        contactId: z.string().describe("The contact id."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/contacts/${args.contactId}`);
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_contact",
    {
      title: "Create contact",
      description:
        "Create a new contact. At least one of email or phone is recommended so the " +
        "contact can be matched/deduplicated. Returns the created contact.",
      inputSchema: {
        locationId,
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        name: z.string().optional().describe("Full name (alternative to first/last)."),
        email: z.string().email().optional(),
        phone: z
          .string()
          .optional()
          .describe("E.164 format recommended, e.g. +15551234567."),
        tags: z.array(z.string()).optional().describe("Tags to apply on creation."),
        source: z.string().optional().describe("Lead source label."),
        companyName: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          locationId: resolveLocationId(args.locationId),
        };
        for (const key of [
          "firstName",
          "lastName",
          "name",
          "email",
          "phone",
          "tags",
          "source",
          "companyName",
        ] as const) {
          if (args[key] !== undefined) body[key] = args[key];
        }
        const data = await ghlRequest("/contacts/", { method: "POST", body });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_update_contact",
    {
      title: "Update contact",
      description:
        "Update fields on an existing contact. Only provided fields are changed.",
      inputSchema: {
        contactId: z.string().describe("The contact id to update."),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        companyName: z.string().optional(),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replaces the contact's tag set with this list."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const { contactId, ...rest } = args;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await ghlRequest(`/contacts/${contactId}`, {
          method: "PUT",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_add_contact_tags",
    {
      title: "Add contact tags",
      description: "Add one or more tags to a contact without removing existing tags.",
      inputSchema: {
        contactId: z.string(),
        tags: z.array(z.string()).min(1).describe("Tags to add."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/contacts/${args.contactId}/tags`, {
          method: "POST",
          body: { tags: args.tags },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_delete_contact",
    {
      title: "Delete contact",
      description:
        "Permanently delete a contact. This is destructive and cannot be undone.",
      inputSchema: {
        contactId: z.string().describe("The contact id to delete."),
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
        const data = await ghlRequest(`/contacts/${args.contactId}`, {
          method: "DELETE",
        });
        return ok(data ?? { deleted: true, contactId: args.contactId });
      }),
  );
}
