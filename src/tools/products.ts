import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest, resolveLocationId } from "../client.js";
import { ok, run } from "../helpers.js";

const locationId = z
  .string()
  .optional()
  .describe("GHL Location (sub-account) ID. Defaults to GHL_LOCATION_ID.");

export function registerProductTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_products",
    {
      title: "List products",
      description:
        "List products in a location with pagination and optional search. Use the " +
        "returned product ids when adding prices or building invoices/estimates.",
      inputSchema: {
        locationId,
        search: z.string().optional().describe("Search by product name."),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          search: args.search,
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
        };
        const data = await ghlRequest("/products/", { query });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_product",
    {
      title: "Get product",
      description: "Fetch a single product by id.",
      inputSchema: {
        locationId,
        productId: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/products/${args.productId}`, {
          query: { locationId: resolveLocationId(args.locationId) },
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_product",
    {
      title: "Create product",
      description:
        "Create a product. After creating, add one or more prices with " +
        "ghl_create_product_price so it can be used on invoices/estimates.",
      inputSchema: {
        locationId,
        name: z.string().describe("Product name."),
        productType: z
          .enum(["DIGITAL", "PHYSICAL", "SERVICE"])
          .default("SERVICE")
          .describe("Product type."),
        description: z.string().optional(),
        availableInStore: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          locationId: resolveLocationId(args.locationId),
          name: args.name,
          productType: args.productType ?? "SERVICE",
        };
        if (args.description !== undefined) body.description = args.description;
        if (args.availableInStore !== undefined)
          body.availableInStore = args.availableInStore;
        const data = await ghlRequest("/products/", { method: "POST", body });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_update_product",
    {
      title: "Update product",
      description: "Update a product's fields. Only provided fields change.",
      inputSchema: {
        locationId,
        productId: z.string(),
        name: z.string().optional(),
        productType: z.enum(["DIGITAL", "PHYSICAL", "SERVICE"]).optional(),
        description: z.string().optional(),
        availableInStore: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const loc = resolveLocationId(args.locationId);
        const { productId, locationId: _loc, ...rest } = args;
        const body: Record<string, unknown> = { locationId: loc };
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await ghlRequest(`/products/${productId}`, {
          method: "PUT",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_delete_product",
    {
      title: "Delete product",
      description: "Delete a product. Destructive.",
      inputSchema: {
        locationId,
        productId: z.string(),
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
        const data = await ghlRequest(`/products/${args.productId}`, {
          method: "DELETE",
          query: { locationId: resolveLocationId(args.locationId) },
        });
        return ok(data ?? { deleted: true, productId: args.productId });
      }),
  );

  server.registerTool(
    "ghl_list_product_prices",
    {
      title: "List product prices",
      description: "List the prices configured for a product.",
      inputSchema: {
        locationId,
        productId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const query: Record<string, string | number | undefined> = {
          locationId: resolveLocationId(args.locationId),
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
        };
        const data = await ghlRequest(`/products/${args.productId}/price`, { query });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_product_price",
    {
      title: "Create product price",
      description:
        "Add a price to a product. type 'one_time' for a single charge or 'recurring' " +
        "for a subscription. amount is in the smallest practical unit of the currency " +
        "as accepted by GHL (typically major units, e.g. 49.99).",
      inputSchema: {
        locationId,
        productId: z.string(),
        name: z.string().describe("Price name/label, e.g. 'Standard'."),
        type: z.enum(["one_time", "recurring"]).default("one_time"),
        currency: z.string().default("USD"),
        amount: z.number().describe("Price amount, e.g. 49.99."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          locationId: resolveLocationId(args.locationId),
          name: args.name,
          type: args.type ?? "one_time",
          currency: args.currency ?? "USD",
          amount: args.amount,
        };
        const data = await ghlRequest(`/products/${args.productId}/price`, {
          method: "POST",
          body,
        });
        return ok(data);
      }),
  );
}
