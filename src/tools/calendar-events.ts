import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Calendar events: read a date range, block time, and manage appointment notes. */
export function registerCalendarEventTools(server: McpServer): void {
  server.registerTool(
    "ghl_get_calendar_events",
    {
      title: "Get calendar events",
      description:
        "List calendar events/appointments within a time window. You must provide one " +
        "of calendarId, userId, or groupId to scope the query. startTime/endTime are " +
        "epoch milliseconds.",
      inputSchema: {
        locationId,
        startTime: z.number().describe("Window start, epoch milliseconds."),
        endTime: z.number().describe("Window end, epoch milliseconds."),
        calendarId: z.string().optional(),
        userId: z.string().optional(),
        groupId: z.string().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        if (!args.calendarId && !args.userId && !args.groupId) {
          throw new Error(
            "Provide one of calendarId, userId, or groupId to scope the event query.",
          );
        }
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          startTime: args.startTime,
          endTime: args.endTime,
          calendarId: args.calendarId,
          userId: args.userId,
          groupId: args.groupId,
        };
        return ok(await ghlRequest("/calendars/events", { query }));
      }),
  );

  server.registerTool(
    "ghl_block_calendar_slot",
    {
      title: "Block calendar slot",
      description:
        "Block off time on a calendar so it can't be booked (e.g. a filming or edit day). " +
        "startTime/endTime are ISO 8601 strings.",
      inputSchema: {
        locationId,
        startTime: z.string().describe("ISO 8601 start time with offset."),
        endTime: z.string().describe("ISO 8601 end time with offset."),
        calendarId: z.string().optional().describe("Calendar to block (optional)."),
        assignedUserId: z.string().optional(),
        title: z.string().optional().describe("Label for the blocked slot."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          locationId: resolveLocationId(args.locationId),
          startTime: args.startTime,
          endTime: args.endTime,
        };
        for (const k of ["calendarId", "assignedUserId", "title"] as const) {
          if (args[k] !== undefined) body[k] = args[k];
        }
        return ok(
          await ghlRequest("/calendars/events/block-slots", { method: "POST", body }),
        );
      }),
  );

  server.registerTool(
    "ghl_list_appointment_notes",
    {
      title: "List appointment notes",
      description: "List notes attached to a calendar appointment.",
      inputSchema: {
        appointmentId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest(`/calendars/appointments/${args.appointmentId}/notes`, {
            query: { limit: args.limit ?? 20, offset: args.offset ?? 0 },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_create_appointment_note",
    {
      title: "Create appointment note",
      description: "Add a note to a calendar appointment (e.g. outcome of a shoot/call).",
      inputSchema: {
        appointmentId: z.string(),
        body: z.string().describe("Note text."),
        userId: z.string().optional().describe("Author user id (defaults to GHL_USER_ID)."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = { body: args.body };
        const userId = args.userId ?? process.env.GHL_USER_ID;
        if (userId) body.userId = userId;
        return ok(
          await ghlRequest(`/calendars/appointments/${args.appointmentId}/notes`, {
            method: "POST",
            body,
          }),
        );
      }),
  );
}
