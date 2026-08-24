import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";
import {
  buildBusinessDetails,
  buildContactDetails,
  getInvoiceSettings,
  resolveSenderUserId,
  today,
} from "./billing-helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/**
 * Estimates live under the GHL Invoices API (/invoices/estimate*). An estimate is a
 * quote you send a contact; it can later be converted into an invoice.
 */
export function registerEstimateTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_estimates",
    {
      title: "List estimates",
      description:
        "List estimates (quotes) for a location with pagination. Optionally filter by " +
        "status or contact.",
      inputSchema: {
        locationId,
        status: z
          .string()
          .optional()
          .describe("Status filter, e.g. draft, sent, accepted, declined, invoiced."),
        contactId: z.string().optional(),
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
          status: args.status,
          contactId: args.contactId,
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
        };
        const data = await ghlRequest("/invoices/estimate/list", { query });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_generate_estimate_number",
    {
      title: "Generate estimate number",
      description:
        "Generate the next available estimate number for the location. Some accounts " +
        "require an estimateNumber when creating an estimate — call this first.",
      inputSchema: { locationId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest("/invoices/estimate/number/generate", {
          query: {
            altId: resolveLocationId(args.locationId),
            altType: "location",
          },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_estimate",
    {
      title: "Create estimate",
      description:
        "Create an estimate (quote) for a contact with line items. If your account " +
        "requires it, get estimateNumber from ghl_generate_estimate_number first. " +
        "issueDate/expiryDate are YYYY-MM-DD.",
      inputSchema: {
        locationId,
        contactId: z.string().describe("Contact the estimate is for."),
        name: z.string().describe("Estimate name/title."),
        currency: z.string().default("USD"),
        items: z
          .array(
            z.object({
              name: z.string(),
              quantity: z.number().min(0).default(1),
              price: z.number().describe("Unit price."),
              description: z.string().optional(),
            }),
          )
          .min(1)
          .describe("Line items on the estimate."),
        issueDate: z
          .string()
          .optional()
          .describe("Issue date as YYYY-MM-DD. Defaults to today."),
        expiryDate: z.string().optional().describe("Expiry date as YYYY-MM-DD."),
        estimateNumber: z
          .union([z.string(), z.number()])
          .optional()
          .describe("Estimate number (from ghl_generate_estimate_number if required)."),
        title: z
          .string()
          .optional()
          .describe("Display title. Defaults to your saved estimate title."),
        termsNotes: z
          .string()
          .optional()
          .describe("Terms & notes. Defaults to your saved estimate terms & notes."),
        applyDefaults: z
          .boolean()
          .default(true)
          .describe(
            "Apply your saved GHL invoice settings (logo, business info, estimate terms " +
              "& notes, title) like the UI does. Set false for a bare estimate.",
          ),
        // Business detail overrides (otherwise from invoice settings / env / location)
        businessName: z.string().optional(),
        businessPhone: z.string().optional(),
        businessAddress: z.string().optional(),
        businessWebsite: z.string().optional(),
        businessLogoUrl: z.string().optional(),
        // Contact detail overrides (otherwise auto-fetched from the contact)
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const currency = args.currency ?? "USD";
        const useDefaults = args.applyDefaults ?? true;
        const settings = useDefaults ? await getInvoiceSettings(loc) : {};
        const body: Record<string, unknown> = {
          altId: loc,
          altType: "location",
          name: args.name,
          currency,
          businessDetails: await buildBusinessDetails(args, loc),
          contactDetails: await buildContactDetails(args.contactId, args),
          issueDate: args.issueDate ?? today(),
          items: args.items.map((it) => ({
            name: it.name,
            currency,
            amount: it.price,
            qty: it.quantity ?? 1,
            ...(it.description ? { description: it.description } : {}),
          })),
        };
        if (args.expiryDate) body.expiryDate = args.expiryDate;
        if (args.estimateNumber !== undefined)
          body.estimateNumber = args.estimateNumber;
        const title = args.title ?? (settings.estimatesTitle as string | undefined);
        if (title) body.title = title;
        const termsNotes =
          args.termsNotes ?? (settings.estimatesTermsNote as string | undefined);
        if (termsNotes) body.termsNotes = termsNotes;
        const data = await ghlRequest("/invoices/estimate", {
          method: "POST",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_update_estimate",
    {
      title: "Update estimate",
      description:
        "Update an existing estimate. Pass the full set of items you want on the " +
        "estimate (they replace the prior items). Only provided top-level fields change.",
      inputSchema: {
        locationId,
        estimateId: z.string(),
        name: z.string().optional(),
        currency: z.string().optional(),
        items: z
          .array(
            z.object({
              name: z.string(),
              quantity: z.number().min(0).default(1),
              price: z.number(),
              description: z.string().optional(),
            }),
          )
          .optional(),
        issueDate: z.string().optional(),
        expiryDate: z.string().optional(),
        title: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const currency = args.currency ?? "USD";
        const body: Record<string, unknown> = {
          altId: loc,
          altType: "location",
        };
        if (args.name !== undefined) body.name = args.name;
        if (args.currency !== undefined) body.currency = args.currency;
        if (args.issueDate !== undefined) body.issueDate = args.issueDate;
        if (args.expiryDate !== undefined) body.expiryDate = args.expiryDate;
        if (args.title !== undefined) body.title = args.title;
        if (args.items !== undefined) {
          body.items = args.items.map((it) => ({
            name: it.name,
            currency,
            amount: it.price,
            qty: it.quantity ?? 1,
            ...(it.description ? { description: it.description } : {}),
          }));
        }
        const data = await ghlRequest(`/invoices/estimate/${args.estimateId}`, {
          method: "PUT",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_send_estimate",
    {
      title: "Send estimate",
      description:
        "Send an estimate to the contact. Outward-facing: this emails/texts the customer.",
      inputSchema: {
        locationId,
        estimateId: z.string(),
        action: z
          .enum(["sms_and_email", "email", "sms"])
          .default("email")
          .describe("Delivery channel."),
        liveMode: z
          .boolean()
          .default(true)
          .describe("If false, performs a test send."),
        userId: z
          .string()
          .optional()
          .describe(
            "Sending user id (GHL requires one). Defaults to GHL_USER_ID, then the " +
              "first location user.",
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const data = await ghlRequest(`/invoices/estimate/${args.estimateId}/send`, {
          method: "POST",
          body: {
            altId: loc,
            altType: "location",
            action: args.action ?? "email",
            liveMode: args.liveMode ?? true,
            userId: await resolveSenderUserId(args.userId, loc),
          },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_estimate_to_invoice",
    {
      title: "Convert estimate to invoice",
      description:
        "Create an invoice from an accepted estimate, carrying over its line items.",
      inputSchema: {
        locationId,
        estimateId: z.string(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(
          `/invoices/estimate/${args.estimateId}/invoice`,
          {
            method: "POST",
            body: {
              altId: resolveLocationId(args.locationId),
              altType: "location",
            },
          },
        );
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_delete_estimate",
    {
      title: "Delete estimate",
      description: "Delete an estimate. Destructive.",
      inputSchema: {
        locationId,
        estimateId: z.string(),
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
        const data = await ghlRequest(`/invoices/estimate/${args.estimateId}`, {
          method: "DELETE",
          query: {
            altId: resolveLocationId(args.locationId),
            altType: "location",
          },
        });
        return ok(data ?? { deleted: true, estimateId: args.estimateId });
      }),
  );
}
