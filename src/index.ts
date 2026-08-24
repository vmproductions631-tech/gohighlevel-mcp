#!/usr/bin/env node
/**
 * GoHighLevel MCP server.
 *
 * Exposes GoHighLevel API v2 capabilities as MCP tools over stdio, grouped into
 * modules that can be toggled off individually.
 *
 * Required environment:
 *   GHL_API_KEY          Private Integration token (Bearer).
 *   GHL_LOCATION_ID      Default Location/sub-account id (optional if every tool
 *                        call passes locationId explicitly).
 * Optional:
 *   GHL_USER_ID          User id used when sending invoices/notes.
 *   GHL_DISABLED_MODULES Comma-separated module names to NOT register, e.g.
 *                        "social,objects,associations". See MODULES below for names.
 *   GHL_BASE_URL         Override API base (default services.leadconnectorhq.com).
 *   GHL_API_VERSION      Override the Version header (default 2021-07-28).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerContactsTools } from "./tools/contacts.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { registerCalendarTools } from "./tools/calendars.js";
import { registerConversationTools } from "./tools/conversations.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerCustomFieldTools } from "./tools/custom-fields.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerProductTools } from "./tools/products.js";
import { registerEstimateTools } from "./tools/estimates.js";
import { registerPaymentTools } from "./tools/payments.js";
import { registerFormSurveyTools } from "./tools/forms-surveys.js";
import { registerUserTools } from "./tools/users.js";
import { registerFunnelTools } from "./tools/funnels.js";
import { registerCalendarEventTools } from "./tools/calendar-events.js";
import { registerSocialTools } from "./tools/social.js";
import { registerMediaTools } from "./tools/media.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerTagTools } from "./tools/tags.js";
import { registerCustomValueTools } from "./tools/custom-values.js";
import { registerBusinessTools } from "./tools/businesses.js";
import { registerObjectTools } from "./tools/objects.js";
import { registerAssociationTools } from "./tools/associations.js";

/** module name -> register function. Names are used by GHL_DISABLED_MODULES. */
const MODULES: Record<string, (server: McpServer) => void> = {
  contacts: registerContactsTools,
  opportunities: registerOpportunityTools,
  calendars: registerCalendarTools,
  conversations: registerConversationTools,
  invoices: registerInvoiceTools,
  workflows: registerWorkflowTools,
  customFields: registerCustomFieldTools,
  tasks: registerTaskTools,
  notes: registerNoteTools,
  products: registerProductTools,
  estimates: registerEstimateTools,
  payments: registerPaymentTools,
  forms: registerFormSurveyTools,
  users: registerUserTools,
  funnels: registerFunnelTools,
  calendarEvents: registerCalendarEventTools,
  social: registerSocialTools,
  media: registerMediaTools,
  campaigns: registerCampaignTools,
  tags: registerTagTools,
  customValues: registerCustomValueTools,
  businesses: registerBusinessTools,
  objects: registerObjectTools,
  associations: registerAssociationTools,
};

async function main(): Promise<void> {
  const server = new McpServer({
    name: "ghl-mcp",
    version: "0.2.0",
  });

  const disabled = new Set(
    (process.env.GHL_DISABLED_MODULES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const enabled: string[] = [];
  for (const [name, register] of Object.entries(MODULES)) {
    if (disabled.has(name)) continue;
    register(server);
    enabled.push(name);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr only — stdout is reserved for the MCP protocol.
  console.error(
    `ghl-mcp running on stdio. Enabled modules (${enabled.length}): ${enabled.join(", ")}` +
      (disabled.size ? ` | disabled: ${[...disabled].join(", ")}` : ""),
  );
}

main().catch((err) => {
  console.error("Fatal error starting ghl-mcp:", err);
  process.exit(1);
});
