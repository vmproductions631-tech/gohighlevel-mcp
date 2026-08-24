import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

/** Payments: orders, transactions, and subscriptions (read-only revenue data). */
export function registerPaymentTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_orders",
    {
      title: "List orders",
      description:
        "List payment orders for a location with pagination. Optionally filter by " +
        "status or contact. Use to see what was purchased and whether it was paid.",
      inputSchema: {
        locationId,
        status: z.string().optional().describe("e.g. completed, refunded, partially_refunded."),
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
        return ok(await ghlRequest("/payments/orders", { query }));
      }),
  );

  server.registerTool(
    "ghl_get_order",
    {
      title: "Get order",
      description: "Fetch a single payment order by id, including line items and amounts.",
      inputSchema: { locationId, orderId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest(`/payments/orders/${args.orderId}`, {
            query: { altId: resolveLocationId(args.locationId), altType: "location" },
          }),
        );
      }),
  );

  server.registerTool(
    "ghl_list_transactions",
    {
      title: "List transactions",
      description:
        "List payment transactions for a location. Useful for reconciling revenue and " +
        "spotting failed or refunded charges.",
      inputSchema: {
        locationId,
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
          contactId: args.contactId,
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
        };
        return ok(await ghlRequest("/payments/transactions", { query }));
      }),
  );

  server.registerTool(
    "ghl_list_subscriptions",
    {
      title: "List subscriptions",
      description:
        "List recurring subscriptions for a location (e.g. retainers). Optionally " +
        "filter by contact.",
      inputSchema: {
        locationId,
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
          contactId: args.contactId,
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
        };
        return ok(await ghlRequest("/payments/subscriptions", { query }));
      }),
  );

  server.registerTool(
    "ghl_get_subscription",
    {
      title: "Get subscription",
      description: "Fetch a single subscription by id.",
      inputSchema: { locationId, subscriptionId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        return ok(
          await ghlRequest(`/payments/subscriptions/${args.subscriptionId}`, {
            query: { altId: resolveLocationId(args.locationId), altType: "location" },
          }),
        );
      }),
  );
}
