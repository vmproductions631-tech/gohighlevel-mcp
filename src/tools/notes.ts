import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../client.js";
import { ok, run } from "../helpers.js";

/** Contact notes: free-text notes logged against a contact. */
export function registerNoteTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_contact_notes",
    {
      title: "List contact notes",
      description: "List all notes logged on a contact, newest first.",
      inputSchema: { contactId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/contacts/${args.contactId}/notes`);
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_contact_note",
    {
      title: "Get contact note",
      description: "Fetch a single note on a contact by id.",
      inputSchema: {
        contactId: z.string(),
        noteId: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(
          `/contacts/${args.contactId}/notes/${args.noteId}`,
        );
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_contact_note",
    {
      title: "Create contact note",
      description: "Add a note to a contact.",
      inputSchema: {
        contactId: z.string(),
        body: z.string().describe("Note text."),
        userId: z
          .string()
          .optional()
          .describe("User id to attribute the note to (defaults to GHL_USER_ID)."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = { body: args.body };
        const userId = args.userId ?? process.env.GHL_USER_ID;
        if (userId) body.userId = userId;
        const data = await ghlRequest(`/contacts/${args.contactId}/notes`, {
          method: "POST",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_update_contact_note",
    {
      title: "Update contact note",
      description: "Update the text of an existing note on a contact.",
      inputSchema: {
        contactId: z.string(),
        noteId: z.string(),
        body: z.string().describe("New note text."),
        userId: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = { body: args.body };
        const userId = args.userId ?? process.env.GHL_USER_ID;
        if (userId) body.userId = userId;
        const data = await ghlRequest(
          `/contacts/${args.contactId}/notes/${args.noteId}`,
          { method: "PUT", body },
        );
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_delete_contact_note",
    {
      title: "Delete contact note",
      description: "Delete a note from a contact. Destructive.",
      inputSchema: {
        contactId: z.string(),
        noteId: z.string(),
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
        const data = await ghlRequest(
          `/contacts/${args.contactId}/notes/${args.noteId}`,
          { method: "DELETE" },
        );
        return ok(data ?? { deleted: true, noteId: args.noteId });
      }),
  );
}
