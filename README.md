# GoHighLevel MCP Server

A Model Context Protocol server that gives an LLM agent operational control of a
[GoHighLevel](https://www.gohighlevel.com) CRM — 114 tools across 24 modules,
covering contacts, pipelines, calendars, messaging, invoicing, and payments over
the GoHighLevel API v2.

## The problem

GoHighLevel is the system of record for a small agency: every client, every
booking, every invoice. The work that actually eats the day is not any single
CRM action but the stitching between them — a shoot gets confirmed, so someone
has to create the opportunity, move it to the right pipeline stage, book the
calendar slot against the right contact, draft the invoice, and log a note. Each
step is thirty seconds of clicking, and the sequence runs several times a week.

That sequence is exactly what an agent can do, if it can reach the CRM. This
server is that reach: it exposes GoHighLevel as typed, annotated tools so an
agent can carry out the whole chain from a sentence of instruction, while the
destructive and outward-facing steps stay visible for approval.

## Architecture

24 tool modules register against one `McpServer` over stdio. Everything routes
through a single `ghlRequest()` that owns auth, the mandatory `Version` header,
query-string assembly, and error shaping. Modules are toggleable at startup via
`GHL_DISABLED_MODULES` — which matters more than it sounds, because 114 tool
definitions is a meaningful chunk of an agent's context window before it has
read a single word of the user's request. A deployment that only does bookings
can register six modules and skip the rest.

```
  MCP host (Claude Desktop / Claude Code)
          | stdio (JSON-RPC)
  +-------v--------------------------------------------+
  |  index.ts   MODULES registry, GHL_DISABLED_MODULES  |
  +-------+--------------------------------------------+
          |
  +-------v-----+ +---------------+ +-----------+ ......  24 modules
  |  contacts   | | opportunities | | invoices  |
  +-------+-----+ +-------+-------+ +-----+-----+
          |               |               |
          |               |         +-----v--------------+
          |               |         | billing-helpers.ts |
          |               |         |  businessDetails   |
          |               |         |  contactDetails    |
          |               |         |  sender resolution |
          |               |         +-----+--------------+
          +-------+-------+---------------+
                  |
        +---------v----------------------------+
        |  client.ts  ghlRequest()             |
        |   Bearer token + Version header      |
        |   status-specific error hints        |
        +---------+----------------------------+
                  |
          services.leadconnectorhq.com
```

Every write tool carries MCP annotations — 17 are marked `destructiveHint`, and
`ghl_send_message` / `ghl_send_invoice` are flagged as outward-facing because
they contact real customers. The host surfaces those before approving a call,
which is the difference between an agent that drafts an invoice and an agent
that mails one to a client by accident.

## The genuinely hard part

Creating an invoice. The endpoint takes `businessDetails` and `contactDetails`
blocks, and the documentation understates both: pass a `contactId` and a couple
of line items, as the docs suggest, and you get a validation error that names no
field. Both blocks are required in full, and `businessDetails.phoneNo` and
`contactDetails.phoneNo` are mandatory — a contact with an email and no phone
cannot be invoiced at all.

Worse, the values have to *match what the UI produces*, or invoices created via
the API look different from invoices created by hand — different logo, missing
terms, wrong numbering. Those defaults are not in the location profile where
you would expect them; they live behind `GET /invoices/settings`, which is the
same source the UI pre-fills from.

[src/tools/billing-helpers.ts](src/tools/billing-helpers.ts) resolves both
blocks so the tools only need a `contactId`. Business details fall through four
levels — per-call argument, `GHL_BUSINESS_*` env, saved invoice settings,
location profile — with each level filling only what the one above left blank.
Contact details are fetched and assembled, with `name` falling back through
full name, first+last, company name, email, then phone, because GoHighLevel
rejects an empty name and real CRM records are frequently missing one. Both
paths throw a message naming the missing field and how to supply it, rather
than surfacing GHL's opaque 422. Each lookup is memoised per location so a batch
of ten invoices costs one settings fetch, not ten.

## What I'd do differently

1. **No tests.** 4,000 lines and none. The fallback chain in `billing-helpers`
   is pure logic over fixture data — the easiest thing in the repo to test and
   the most costly to get wrong, since the failure mode is a malformed invoice
   sent to a client.
2. **No retry on 429.** `ghlRequest` tells the caller "rate limited; retry after
   a short delay" and then does not retry. Backoff belongs in the client, not in
   the agent's judgement.
3. **The caches are module-level mutable maps with no invalidation.** Correct
   for a stdio server the host restarts freely; wrong the moment this runs as a
   long-lived process, where a business-profile edit would never be picked up.
4. **Responses are `Record<string, unknown>` throughout.** GoHighLevel publishes
   an OpenAPI spec; generating types from it would turn a class of runtime
   surprises into compile errors.
5. **114 tools in one server is too many.** Module toggles are a workaround, not
   a fix. The better shape is a small set of tools plus a discovery mechanism,
   so the agent pays for what it uses.

## Setup

Requires Node 20+ and a GoHighLevel account.

### 1. Create a Private Integration token

**Settings → Private Integrations → Create new integration.** Enable the scopes
matching the tools you intend to use; at minimum:

`contacts.readonly`, `contacts.write`, `opportunities.readonly`,
`opportunities.write`, `calendars.readonly`, `calendars/events.write`,
`conversations.readonly`, `conversations/message.write`, `invoices.readonly`,
`invoices.write`, `products.readonly`, `products.write`,
`locations/customFields.readonly`, `workflows.readonly`

Copy the token — it starts with `pit-`.

### 2. Find your Location ID

**Settings → Business Profile**, or read it out of the dashboard URL:
`.../location/<LOCATION_ID>/...`

### 3. Build

```bash
git clone <this-repo>
cd ghl-mcp
npm install
npm run build
```

### 4. Register with an MCP host

```json
{
  "mcpServers": {
    "gohighlevel": {
      "command": "node",
      "args": ["/absolute/path/to/ghl-mcp/dist/index.js"],
      "env": {
        "GHL_API_KEY": "pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "GHL_LOCATION_ID": "your-location-id"
      }
    }
  }
}
```

Restart the host. See [.env.example](.env.example) for every supported variable,
including the invoice business block and the module toggles.

To exercise the server without a host:

```bash
GHL_API_KEY=pit-... GHL_LOCATION_ID=... npm run inspect
```

### A note on "building automations"

GoHighLevel's API cannot create workflow logic — the visual builder is UI-only.
The supported pattern is to build the workflow once in the UI, find its id with
`ghl_list_workflows`, and enrol contacts with `ghl_add_contact_to_workflow`.

## Tool reference

| Area | Tools |
| --- | --- |
| **Contacts** | `ghl_search_contacts`, `ghl_get_contact`, `ghl_create_contact`, `ghl_update_contact`, `ghl_add_contact_tags`, `ghl_delete_contact` |
| **Opportunities / Pipelines** | `ghl_get_pipelines`, `ghl_search_opportunities`, `ghl_get_opportunity`, `ghl_create_opportunity`, `ghl_update_opportunity` |
| **Calendars / Appointments** | `ghl_get_calendars`, `ghl_get_free_slots`, `ghl_create_appointment`, `ghl_get_appointment`, `ghl_update_appointment`, `ghl_delete_appointment` |
| **Conversations / Messaging** | `ghl_search_conversations`, `ghl_get_messages`, `ghl_send_message` |
| **Invoices** | `ghl_list_invoices`, `ghl_get_invoice`, `ghl_create_invoice`, `ghl_send_invoice`, `ghl_void_invoice`, `ghl_delete_invoice` |
| **Estimates** | `ghl_list_estimates`, `ghl_generate_estimate_number`, `ghl_create_estimate`, `ghl_update_estimate`, `ghl_send_estimate`, `ghl_estimate_to_invoice`, `ghl_delete_estimate` |
| **Products** | `ghl_list_products`, `ghl_get_product`, `ghl_create_product`, `ghl_update_product`, `ghl_delete_product`, `ghl_list_product_prices`, `ghl_create_product_price` |
| **Custom Fields** | `ghl_list_custom_fields`, `ghl_get_custom_field`, `ghl_create_custom_field`, `ghl_update_custom_field`, `ghl_delete_custom_field` |
| **Tasks** | `ghl_list_contact_tasks`, `ghl_get_contact_task`, `ghl_create_contact_task`, `ghl_update_contact_task`, `ghl_delete_contact_task` |
| **Notes** | `ghl_list_contact_notes`, `ghl_get_contact_note`, `ghl_create_contact_note`, `ghl_update_contact_note`, `ghl_delete_contact_note` |
| **Workflows (automations)** | `ghl_list_workflows`, `ghl_add_contact_to_workflow`, `ghl_remove_contact_from_workflow` |
| **Payments** | `ghl_list_orders`, `ghl_get_order`, `ghl_list_transactions`, `ghl_list_subscriptions`, `ghl_get_subscription` |
| **Forms & Surveys** | `ghl_list_forms`, `ghl_get_form_submissions`, `ghl_list_surveys`, `ghl_get_survey_submissions` |
| **Users & Teams** | `ghl_list_users`, `ghl_get_user` |
| **Calendar events** | `ghl_get_calendar_events`, `ghl_block_calendar_slot`, `ghl_list_appointment_notes`, `ghl_create_appointment_note` |
| **Social Planner** | `ghl_list_social_accounts`, `ghl_list_social_posts`, `ghl_get_social_post`, `ghl_create_social_post`, `ghl_delete_social_post` |
| **Media Library** | `ghl_list_media`, `ghl_upload_media_by_url`, `ghl_delete_media` |
| **Campaigns & Links** | `ghl_list_campaigns`, `ghl_add_contact_to_campaign`, `ghl_remove_contact_from_campaign`, `ghl_list_trigger_links`, `ghl_create_trigger_link`, `ghl_delete_trigger_link` |
| **Tags** | `ghl_list_tags`, `ghl_create_tag`, `ghl_update_tag`, `ghl_delete_tag` |
| **Custom Values** | `ghl_list_custom_values`, `ghl_get_custom_value`, `ghl_create_custom_value`, `ghl_update_custom_value`, `ghl_delete_custom_value` |
| **Businesses** | `ghl_list_businesses`, `ghl_get_business`, `ghl_create_business`, `ghl_update_business`, `ghl_delete_business` |
| **Custom Objects** | `ghl_list_object_schemas`, `ghl_get_object_schema`, `ghl_search_object_records`, `ghl_get_object_record`, `ghl_create_object_record`, `ghl_update_object_record`, `ghl_delete_object_record` |
| **Associations** | `ghl_list_associations`, `ghl_get_record_relations`, `ghl_create_relation`, `ghl_delete_relation` |
| **Funnels** | `ghl_list_funnels`, `ghl_list_funnel_pages` |

## Licence

MIT — see [LICENSE](LICENSE). Not affiliated with or endorsed by GoHighLevel.
