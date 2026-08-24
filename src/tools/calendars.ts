import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "ghl_get_calendars",
    {
      title: "List calendars",
      description:
        "List calendars for a location. Use this to find a calendarId for booking " +
        "and availability lookups.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest("/calendars/", {
          query: { locationId: resolveLocationId(args.locationId) },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_free_slots",
    {
      title: "Get free appointment slots",
      description:
        "Get available booking slots for a calendar within a date range. " +
        "startDate and endDate are epoch milliseconds.",
      inputSchema: {
        calendarId: z.string(),
        startDate: z
          .number()
          .describe("Range start as epoch milliseconds (e.g. Date.now())."),
        endDate: z.number().describe("Range end as epoch milliseconds."),
        timezone: z
          .string()
          .optional()
          .describe("IANA timezone, e.g. America/New_York."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/calendars/${args.calendarId}/free-slots`, {
          query: {
            startDate: args.startDate,
            endDate: args.endDate,
            timezone: args.timezone,
          },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_appointment",
    {
      title: "Book appointment",
      description:
        "Book an appointment on a calendar for a contact. startTime/endTime are " +
        "ISO 8601 strings (e.g. 2026-06-20T15:00:00-04:00). Use ghl_get_free_slots first.",
      inputSchema: {
        locationId,
        calendarId: z.string(),
        contactId: z.string(),
        startTime: z.string().describe("ISO 8601 start time with offset."),
        endTime: z.string().optional().describe("ISO 8601 end time with offset."),
        title: z.string().optional().describe("Appointment title."),
        assignedUserId: z.string().optional(),
        appointmentStatus: z
          .enum(["new", "confirmed", "cancelled", "showed", "noshow"])
          .optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          locationId: resolveLocationId(args.locationId),
          calendarId: args.calendarId,
          contactId: args.contactId,
          startTime: args.startTime,
        };
        for (const key of [
          "endTime",
          "title",
          "assignedUserId",
          "appointmentStatus",
        ] as const) {
          if (args[key] !== undefined) body[key] = args[key];
        }
        const data = await ghlRequest("/calendars/events/appointments", {
          method: "POST",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_appointment",
    {
      title: "Get appointment",
      description: "Fetch a single calendar appointment/event by id.",
      inputSchema: { appointmentId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(
          `/calendars/events/appointments/${args.appointmentId}`,
        );
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_update_appointment",
    {
      title: "Update appointment",
      description:
        "Update an appointment's time or status (e.g. confirm, cancel, mark showed). " +
        "Only provided fields are changed.",
      inputSchema: {
        appointmentId: z.string(),
        startTime: z.string().optional().describe("ISO 8601 start time."),
        endTime: z.string().optional().describe("ISO 8601 end time."),
        title: z.string().optional(),
        appointmentStatus: z
          .enum(["new", "confirmed", "cancelled", "showed", "noshow"])
          .optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const { appointmentId, ...rest } = args;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await ghlRequest(
          `/calendars/events/appointments/${appointmentId}`,
          { method: "PUT", body },
        );
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_delete_appointment",
    {
      title: "Delete appointment / calendar event",
      description:
        "Delete a calendar event by its id. Works for both appointments and blocked " +
        "time slots. Destructive and cannot be undone — to keep the record but mark it " +
        "off, use ghl_update_appointment with appointmentStatus 'cancelled' instead.",
      inputSchema: {
        eventId: z
          .string()
          .describe("The event/appointment id (also accepts a blocked-slot id)."),
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
        const data = await ghlRequest(`/calendars/events/${args.eventId}`, {
          method: "DELETE",
        });
        return ok(data ?? { deleted: true, eventId: args.eventId });
      }),
  );
}
