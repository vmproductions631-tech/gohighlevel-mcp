import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

export function registerConversationTools(server: McpServer): void {
  server.registerTool(
    "ghl_search_conversations",
    {
      title: "Search conversations",
      description:
        "Search conversations in a location, optionally filtered to a contact. " +
        "Returns conversation threads with their ids and last-message info.",
      inputSchema: {
        locationId,
        query: z.string().optional().describe("Free-text search."),
        contactId: z.string().optional().describe("Filter to one contact's threads."),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          query: args.query,
          contactId: args.contactId,
          limit: args.limit ?? 20,
        };
        const data = await ghlRequest("/conversations/search", { query });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_messages",
    {
      title: "Get conversation messages",
      description:
        "Fetch messages within a conversation thread, newest first. Use " +
        "ghl_search_conversations to find a conversationId.",
      inputSchema: {
        conversationId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(
          `/conversations/${args.conversationId}/messages`,
          { query: { limit: args.limit ?? 20 } },
        );
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_send_message",
    {
      title: "Send message",
      description:
        "Send an outbound message to a contact via SMS or Email. For Email you must " +
        "provide subject and html (or message as plain text). For SMS provide message. " +
        "The contact must have a valid phone/email for the chosen channel.",
      inputSchema: {
        contactId: z.string().describe("Recipient contact id."),
        type: z
          .enum(["SMS", "Email"])
          .describe("Channel to send through."),
        message: z
          .string()
          .optional()
          .describe("Message body (required for SMS; plain-text body for Email)."),
        subject: z.string().optional().describe("Email subject (Email only)."),
        html: z.string().optional().describe("HTML email body (Email only)."),
        fromNumber: z
          .string()
          .optional()
          .describe("Override the sending phone number (SMS)."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          type: args.type,
          contactId: args.contactId,
        };
        if (args.message !== undefined) body.message = args.message;
        if (args.subject !== undefined) body.subject = args.subject;
        if (args.html !== undefined) body.html = args.html;
        if (args.fromNumber !== undefined) body.fromNumber = args.fromNumber;
        const data = await ghlRequest("/conversations/messages", {
          method: "POST",
          body,
        });
        return ok(data);
      }),
  );
}
