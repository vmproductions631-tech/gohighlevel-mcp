import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Forms & Surveys: list definitions and read submissions (e.g. podcast questionnaires). */
export function registerFormSurveyTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_forms",
    {
      title: "List forms",
      description: "List forms in a location. Use the returned form ids to fetch submissions.",
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
        return ok(await ghlRequest("/forms/", { query }));
      }),
  );

  server.registerTool(
    "ghl_get_form_submissions",
    {
      title: "Get form submissions",
      description:
        "Fetch submissions for a location's forms, optionally filtered to one form or a " +
        "date range. Dates are YYYY-MM-DD.",
      inputSchema: {
        locationId,
        formId: z.string().optional().describe("Filter to a single form."),
        startAt: z.string().optional().describe("Start date YYYY-MM-DD."),
        endAt: z.string().optional().describe("End date YYYY-MM-DD."),
        limit: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          formId: args.formId,
          startAt: args.startAt,
          endAt: args.endAt,
          limit: args.limit ?? 20,
          page: args.page ?? 1,
        };
        return ok(await ghlRequest("/forms/submissions", { query }));
      }),
  );

  server.registerTool(
    "ghl_list_surveys",
    {
      title: "List surveys",
      description: "List surveys in a location. Use the returned survey ids to fetch submissions.",
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
        return ok(await ghlRequest("/surveys/", { query }));
      }),
  );

  server.registerTool(
    "ghl_get_survey_submissions",
    {
      title: "Get survey submissions",
      description:
        "Fetch submissions for a location's surveys, optionally filtered to one survey.",
      inputSchema: {
        locationId,
        surveyId: z.string().optional(),
        startAt: z.string().optional().describe("Start date YYYY-MM-DD."),
        endAt: z.string().optional().describe("End date YYYY-MM-DD."),
        limit: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          surveyId: args.surveyId,
          startAt: args.startAt,
          endAt: args.endAt,
          limit: args.limit ?? 20,
          page: args.page ?? 1,
        };
        return ok(await ghlRequest("/surveys/submissions", { query }));
      }),
  );
}
