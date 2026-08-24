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

export function registerInvoiceTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_invoices",
    {
      title: "List invoices",
      description:
        "List invoices for a location with pagination. Optionally filter by status " +
        "(e.g. draft, sent, paid) and contact.",
      inputSchema: {
        locationId,
        status: z
          .string()
          .optional()
          .describe("Status filter, e.g. draft, sent, paid, void, partially_paid."),
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
        const data = await ghlRequest("/invoices/", { query });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_invoice",
    {
      title: "Get invoice",
      description: "Fetch a single invoice by id, including line items and totals.",
      inputSchema: {
        locationId,
        invoiceId: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/invoices/${args.invoiceId}`, {
          query: {
            altId: resolveLocationId(args.locationId),
            altType: "location",
          },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_invoice",
    {
      title: "Create invoice",
      description:
        "Create a draft invoice for a contact. Provide line items (name, qty, price). " +
        "Business details are taken from GHL_BUSINESS_* env vars (or businessName/" +
        "businessPhone overrides); contact details (name, phone, email, address) are " +
        "auto-filled from the contact record. The invoice is created in draft status; " +
        "use ghl_send_invoice to deliver it.",
      inputSchema: {
        locationId,
        contactId: z.string().describe("Contact the invoice is billed to."),
        name: z.string().describe("Invoice name/title."),
        currency: z
          .string()
          .default("USD")
          .describe("ISO currency code, e.g. USD."),
        items: z
          .array(
            z.object({
              name: z.string().describe("Line item name."),
              quantity: z.number().min(0).default(1),
              price: z.number().describe("Unit price."),
              description: z.string().optional(),
            }),
          )
          .min(1)
          .describe("Line items on the invoice."),
        dueDate: z
          .string()
          .optional()
          .describe("Due date as YYYY-MM-DD. Defaults to the issue date."),
        issueDate: z
          .string()
          .optional()
          .describe("Issue date as YYYY-MM-DD. Defaults to today."),
        title: z
          .string()
          .optional()
          .describe("Display title. Defaults to your invoice-settings title (e.g. INVOICE)."),
        termsNotes: z
          .string()
          .optional()
          .describe("Terms & notes. Defaults to your saved invoice terms & notes."),
        applyDefaults: z
          .boolean()
          .default(true)
          .describe(
            "Apply your saved GHL invoice settings (logo, business info, terms & notes, " +
              "title, due-after-days) like the UI does. Set false for a bare invoice.",
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
        const issueDate = args.issueDate ?? today();
        const currency = args.currency ?? "USD";
        const useDefaults = args.applyDefaults ?? true;
        const settings = useDefaults ? await getInvoiceSettings(loc) : {};

        // Default due date = issueDate + dueAfterXDays from settings (if configured).
        let dueDate = args.dueDate;
        if (!dueDate) {
          const dueAfter = Number(settings.dueAfterXDays);
          if (Number.isFinite(dueAfter) && dueAfter > 0) {
            const d = new Date(`${issueDate}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + dueAfter);
            dueDate = d.toISOString().slice(0, 10);
          } else {
            dueDate = issueDate;
          }
        }

        const body: Record<string, unknown> = {
          altId: loc,
          altType: "location",
          name: args.name,
          currency,
          businessDetails: await buildBusinessDetails(args, loc),
          contactDetails: await buildContactDetails(args.contactId, args),
          issueDate,
          dueDate,
          items: args.items.map((it) => ({
            name: it.name,
            currency,
            qty: it.quantity ?? 1,
            amount: it.price,
            ...(it.description ? { description: it.description } : {}),
          })),
        };

        const title = args.title ?? (settings.title as string | undefined);
        if (title) body.title = title;
        const termsNotes =
          args.termsNotes ?? (settings.termsNote as string | undefined);
        if (termsNotes) body.termsNotes = termsNotes;

        const data = await ghlRequest("/invoices/", { method: "POST", body });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_send_invoice",
    {
      title: "Send invoice",
      description:
        "Send/deliver an existing invoice to the contact via the configured channel(s). " +
        "This is outward-facing: it emails/texts the customer.",
      inputSchema: {
        locationId,
        invoiceId: z.string(),
        action: z
          .enum(["sms_and_email", "email", "sms"])
          .default("email")
          .describe("Delivery channel."),
        liveMode: z
          .boolean()
          .default(true)
          .describe("If false, performs a test send without charging."),
        userId: z
          .string()
          .optional()
          .describe(
            "Sending user id (GHL requires one). Defaults to GHL_USER_ID, then the " +
              "first location user. Use ghl_list_users to find one.",
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const data = await ghlRequest(`/invoices/${args.invoiceId}/send`, {
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
    "ghl_void_invoice",
    {
      title: "Void invoice",
      description:
        "Void an invoice. Use this for invoices that have already been sent (which can " +
        "no longer be deleted). Voiding cancels the invoice while keeping the record.",
      inputSchema: { locationId, invoiceId: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/invoices/${args.invoiceId}/void`, {
          method: "POST",
          body: {
            altId: resolveLocationId(args.locationId),
            altType: "location",
          },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_delete_invoice",
    {
      title: "Delete invoice",
      description:
        "Delete an invoice. Only works while it is a draft — a sent invoice must be " +
        "voided with ghl_void_invoice instead. Destructive and cannot be undone.",
      inputSchema: { locationId, invoiceId: z.string() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/invoices/${args.invoiceId}`, {
          method: "DELETE",
          query: {
            altId: resolveLocationId(args.locationId),
            altType: "location",
          },
        });
        return ok(data ?? { deleted: true, invoiceId: args.invoiceId });
      }),
  );
}
