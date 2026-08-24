import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../client.js";
import { ok, run } from "../helpers.js";

/** Contact tasks: to-dos attached to a contact, with due dates and assignees. */
export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    "ghl_list_contact_tasks",
    {
      title: "List contact tasks",
      description: "List all tasks attached to a contact.",
      inputSchema: { contactId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(`/contacts/${args.contactId}/tasks`);
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_get_contact_task",
    {
      title: "Get contact task",
      description: "Fetch a single task on a contact by id.",
      inputSchema: {
        contactId: z.string(),
        taskId: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const data = await ghlRequest(
          `/contacts/${args.contactId}/tasks/${args.taskId}`,
        );
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_create_contact_task",
    {
      title: "Create contact task",
      description:
        "Create a task on a contact. dueDate is ISO 8601 (e.g. 2026-06-20T17:00:00Z).",
      inputSchema: {
        contactId: z.string(),
        title: z.string().describe("Task title."),
        dueDate: z.string().describe("Due date/time as ISO 8601."),
        body: z.string().optional().describe("Task details/notes."),
        completed: z.boolean().default(false),
        assignedTo: z.string().optional().describe("User id to assign the task to."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const body: Record<string, unknown> = {
          title: args.title,
          dueDate: args.dueDate,
          completed: args.completed ?? false,
        };
        if (args.body !== undefined) body.body = args.body;
        if (args.assignedTo !== undefined) body.assignedTo = args.assignedTo;
        const data = await ghlRequest(`/contacts/${args.contactId}/tasks`, {
          method: "POST",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_update_contact_task",
    {
      title: "Update contact task",
      description:
        "Update a task (e.g. mark completed, change due date or assignee). Only " +
        "provided fields change.",
      inputSchema: {
        contactId: z.string(),
        taskId: z.string(),
        title: z.string().optional(),
        dueDate: z.string().optional(),
        body: z.string().optional(),
        completed: z.boolean().optional(),
        assignedTo: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      run(async () => {
        const { contactId, taskId, ...rest } = args;
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined) body[k] = v;
        }
        const data = await ghlRequest(`/contacts/${contactId}/tasks/${taskId}`, {
          method: "PUT",
          body,
        });
        return ok(data);
      }),
  );

  server.registerTool(
    "ghl_delete_contact_task",
    {
      title: "Delete contact task",
      description: "Delete a task from a contact. Destructive.",
      inputSchema: {
        contactId: z.string(),
        taskId: z.string(),
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
        const data = await ghlRequest(
          `/contacts/${args.contactId}/tasks/${args.taskId}`,
          { method: "DELETE" },
        );
        return ok(data ?? { deleted: true, taskId: args.taskId });
      }),
  );
}
