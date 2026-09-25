import { TEAM_TOOLS } from "./assistant-teams.mjs";
import { withAgentToolUser } from "./agent-tool-context.mjs";
import * as automations from "../automations/route";
import * as automation from "../automations/[id]/route";
import * as runs from "../automations/[id]/runs/route";
import * as run from "../automations/[id]/run/route";
import { PATCH as updateColleague } from "../colleagues/[id]/route";
import Task from "../models/task.mjs";
import {
    publishColleagueMessage,
    getAssistantConversation,
} from "./colleague-chat.js";
import { normalizeNotificationDestination } from "../../../src/utils/notificationDestination.js";

const fields = [
    "name",
    "slug",
    "description",
    "content",
    "enabled",
    "schedule",
    "timezone",
    "producesHtml",
    "inputs",
];
const pick = (args, keys) =>
    Object.fromEntries(
        keys.filter((k) => args[k] !== undefined).map((k) => [k, args[k]]),
    );
const requestFor = (body = {}) =>
    new Request("http://agent-tools.internal/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
export function isTaskAssignedToEntity(task, user, entity) {
    return (
        String(task.owner) === String(user._id) &&
        (task.entityId || user.personalEntityId) === entity.id
    );
}

// Reuse the ordinary API handlers, including storage, validation and run dispatch.
// The authenticated user scope exists only for this invocation, never globally.
export async function executeColleagueTool({
    user,
    entity,
    tool,
    args,
    operationId,
    binding,
}) {
    return withAgentToolUser(user, async () => {
        if (tool === "media") {
            const { executeMediaTool } = await import("./agent-media.js");
            return Response.json(
                await executeMediaTool({
                    user,
                    entity,
                    binding,
                    args,
                    operationId,
                }),
            );
        }
        if (
            [
                ...TEAM_TOOLS,
                "listassistants",
                "readassistanttasks",
                "messageassistants",
                "askuser",
                "answertaskquestion",
            ].includes(tool)
        ) {
            const { executeCoordinationTool } = await import(
                "./assistant-coordination.mjs"
            );
            return Response.json(
                await executeCoordinationTool({
                    user,
                    entity,
                    binding,
                    tool,
                    args,
                    operationId,
                }),
            );
        }
        if (tool === "notifyuser") {
            const url = normalizeNotificationDestination(args.url);
            if (args.url != null && args.url !== "" && !url)
                return Response.json(
                    {
                        error: "Use a relative app path or an http(s) destination URL",
                    },
                    { status: 400 },
                );
            if (
                !operationId ||
                typeof args.message !== "string" ||
                !args.message.trim() ||
                args.message.length > 8000 ||
                !["result", "help"].includes(args.kind)
            )
                return Response.json(
                    { error: "Invalid notification" },
                    { status: 400 },
                );
            let chatId = binding?.chatId;
            let teamId;
            let recipient = entity;
            if (binding?.taskId && binding.anchor) {
                const root = await Task.findOne({
                    _id: binding.taskId,
                    owner: user._id,
                    assistantTeamRevision: { $gt: 0 },
                }).select("assistantRootId");
                if (root) teamId = root.assistantRootId || root._id;
            }
            if (binding?.taskId && !binding.anchor) {
                const task = await Task.findOne({
                    _id: binding.taskId,
                    owner: user._id,
                    assistantEntityId: entity.id,
                });
                if (!task)
                    return Response.json(
                        { error: "Task not found" },
                        { status: 404 },
                    );
                const conversation = await getAssistantConversation(
                    user,
                    task,
                    { create: true },
                );
                chatId = String(conversation.chat._id);
                teamId =
                    conversation.root.assistantTeamRevision > 0
                        ? String(conversation.root._id)
                        : undefined;
                if (conversation.entityId !== entity.id) {
                    const { requireColleague } = await import(
                        "./colleagues.js"
                    );
                    recipient = await requireColleague(
                        user,
                        conversation.entityId,
                    );
                }
            }
            const notification = await publishColleagueMessage(user, {
                _id: operationId,
                entityId: recipient.id,
                name: recipient.name,
                entityKind: recipient.kind,
                avatar: recipient.avatar,
                chatId,
                teamId,
                url,
                message:
                    recipient.id === entity.id
                        ? args.message.trim()
                        : `${entity.name}: ${args.message.trim()}`,
                kind: args.kind,
            });
            return Response.json({
                success: true,
                delivery: "inbox",
                chatId: notification.metadata.chatId,
            });
        }
        if (tool === "readcolleaguesettings") return Response.json(entity);
        if (tool === "updatecolleaguesettings") {
            const settings = pick(args, [
                "name",
                "description",
                "instructions",
                "avatar",
                "status",
                "model",
                "reasoningEffort",
                "memoryLearning",
            ]);
            if (!Object.keys(settings).length)
                return Response.json(
                    { error: "Provide at least one setting" },
                    { status: 400 },
                );
            return updateColleague(requestFor(settings), {
                params: { id: entity.id },
            });
        }
        if (tool === "listautomations") {
            const response = await automations.GET();
            if (!response.ok) return response;
            const data = await response.json();
            return Response.json({
                automations: data.automations.filter((t) =>
                    isTaskAssignedToEntity(t, user, entity),
                ),
                entityId: entity.id,
            });
        }
        if (tool === "createautomation") {
            return automations.POST(
                requestFor({ ...pick(args, fields), entityId: entity.id }),
            );
        }
        if (
            ![
                "readautomation",
                "updateautomation",
                "runautomation",
                "deleteautomation",
                "readautomationruns",
            ].includes(tool)
        )
            return Response.json(
                { error: "Unknown colleague tool" },
                { status: 400 },
            );
        if (!args.idOrSlug || typeof args.idOrSlug !== "string")
            return Response.json(
                { error: "idOrSlug is required" },
                { status: 400 },
            );

        // Read through the owner list to enforce assignment before any file read,
        // mutation, run or deletion. Shared tasks keep their normal browser UX.
        const listed = await automations.GET();
        if (!listed.ok) return listed;
        const { automations: tasks } = await listed.json();
        const task = tasks.find(
            (t) =>
                (String(t._id) === args.idOrSlug || t.slug === args.idOrSlug) &&
                isTaskAssignedToEntity(t, user, entity),
        );
        if (!task)
            return Response.json(
                { error: "Task is not assigned to this colleague" },
                { status: 404 },
            );
        const params = { params: { id: String(task._id) } };
        if (tool === "readautomation")
            return automation.GET(requestFor(), params);
        if (tool === "updateautomation")
            return automation.PUT(requestFor(pick(args, fields)), params);
        if (tool === "runautomation")
            return run.POST(requestFor({ inputs: args.inputs }), params);
        if (tool === "deleteautomation")
            return automation.DELETE(requestFor(), params);
        return runs.GET(
            new Request(
                `http://agent-tools.internal/?page=${Math.max(1, Math.trunc(Number(args.page)) || 1)}&limit=20`,
            ),
            params,
        );
    });
}
