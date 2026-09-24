import Workspace from "../models/workspace.js";
import Applet from "../models/applet.js";
import { validateAppletAccess } from "../applet/access.js";
import { resolveShareAccess } from "./shareAccess.js";
import {
    buildMediaHelperFileParams,
    resolveStorageTarget,
} from "../../../src/utils/storageTargets.js";

const fail = () => {
    throw Object.assign(
        new Error("Not authorized to access files in this context"),
        { status: 403 },
    );
};
const readAction = (action) => action === "read" || action === "list";
const id = (value) =>
    value == null || value === ""
        ? null
        : typeof value === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(value)
          ? value
          : fail();

export async function resolveAuthorizedMediaRouting({
    user,
    routingInput = {},
    action = "read",
} = {}) {
    if (!user?._id || !user.contextId)
        throw Object.assign(new Error("Authentication required"), {
            status: 401,
        });
    const requestedUserId = id(
        routingInput.userId || routingInput.userContextId,
    );
    if (requestedUserId && requestedUserId !== user.contextId) fail();
    let contextId = id(routingInput.contextId);
    let workspaceId = id(routingInput.workspaceId);
    let appletId = id(routingInput.appletId);
    let fileScope = routingInput.fileScope || null;
    const chatId = id(routingInput.chatId);
    if (
        contextId &&
        contextId !== user.contextId &&
        !workspaceId &&
        !appletId &&
        !requestedUserId &&
        !chatId &&
        (!fileScope || fileScope === "all")
    ) {
        // URL renewal may carry only the canonical context and blob path.
        // Recover its scope before applying the same ownership/share checks.
        const appletContext = contextId.match(
            /^applet-(shared|user):([a-fA-F0-9]{24})(?::(.+))?$/,
        );
        if (appletContext) {
            fileScope = `applet-${appletContext[1]}`;
            appletId = appletContext[2];
        } else {
            workspaceId = contextId;
            fileScope = "workspace-shared-legacy";
        }
    }
    if (
        ![
            null,
            "all",
            "global",
            "media",
            "chat",
            "applet-user",
            "applet-shared",
            "applets",
            "workspace-user-legacy",
            "workspace-shared-legacy",
            "profile",
            "articles",
            "skills",
            "automations",
        ].includes(fileScope)
    )
        fail();
    if (fileScope === "workspace-shared-legacy") {
        if (!workspaceId || (contextId && contextId !== workspaceId)) fail();
        let workspace = await Workspace.findOne({
            _id: workspaceId,
            owner: user._id,
        })
            .select("_id")
            .catch(() => null);
        if (!workspace && readAction(action)) {
            workspace = await Workspace.findOne({ _id: workspaceId })
                .select("_id owner")
                .lean()
                .catch(() => null);
            if (workspace) {
                const access = await resolveShareAccess({
                    entityType: "workspace",
                    entityId: workspaceId,
                    userId: user._id,
                    ownerId: workspace.owner,
                });
                if (!access.canAccess) fail();
            }
        }
        if (!workspace) fail();
        contextId = workspaceId;
    } else if (fileScope === "applet-shared" || fileScope === "applet-user") {
        appletId ||= workspaceId;
        if (!appletId || !/^[a-fA-F0-9]{24}$/.test(appletId)) fail();
        const expectedContext =
            fileScope === "applet-shared"
                ? `applet-shared:${appletId}`
                : `applet-user:${appletId}:${user.contextId}`;
        if (
            contextId &&
            contextId !== expectedContext &&
            contextId !== user.contextId
        )
            fail();
        let attachedAssistant = null;
        if (
            fileScope === "applet-shared" &&
            !(await Applet.findById(appletId).select("_id").lean())
        ) {
            const { listColleagues } = await import("./colleagues.js");
            attachedAssistant =
                (
                    await listColleagues(user, {
                        materialsContext: expectedContext,
                        limit: 1,
                    })
                )[0] || null;
        }
        if (attachedAssistant) {
            if (!readAction(action) && !attachedAssistant.editable) fail();
        } else if (fileScope === "applet-shared" && !readAction(action)) {
            const applet = await Applet.findById(appletId)
                .select("owner")
                .lean();
            if (!applet) fail();
            const access = await resolveShareAccess({
                entityType: "applet",
                entityId: appletId,
                userId: user._id,
                ownerId: applet.owner,
            });
            if (
                !access.isOwner &&
                !(access.canAccess && access.role === "editor")
            )
                fail();
        } else if (await validateAppletAccess(appletId, user)) fail();
        contextId = expectedContext;
    } else {
        if (contextId && contextId !== user.contextId) fail();
        contextId = user.contextId;
    }
    const storageTarget = resolveStorageTarget({
        contextId,
        workspaceId,
        appletId,
        chatId,
        fileScope,
        userId:
            fileScope === "workspace-shared-legacy" ||
            fileScope === "applet-shared"
                ? null
                : user.contextId,
    });
    return {
        storageTarget,
        routingParams: buildMediaHelperFileParams({ storageTarget }),
    };
}

export function grantTargetForRouting(routing, actions) {
    const scope = routing.fileScope || "global";
    let owner = routing.contextId || routing.userId;
    let prefix;
    if (scope === "workspace-shared-legacy") {
        owner = routing.workspaceId;
        prefix = "";
    } else if (scope === "applet-shared") {
        owner = `applet-shared:${routing.appletId || routing.workspaceId}`;
        prefix = "applet-shared/";
    } else if (scope === "applet-user") {
        owner = routing.userId;
        prefix = `applets/${routing.appletId || routing.workspaceId}/`;
    } else if (scope === "all") prefix = "";
    else if (scope === "chat")
        prefix = routing.chatId ? `chats/${routing.chatId}/` : "global/";
    else if (scope === "workspace-user-legacy")
        prefix = routing.workspaceId
            ? `applets/${routing.workspaceId}/`
            : "global/";
    else prefix = `${scope}/`;
    return { owner, prefix, actions };
}
