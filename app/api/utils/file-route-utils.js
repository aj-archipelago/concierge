import Workspace from "../models/workspace.js";
import {
    buildMediaHelperFileParams,
    resolveStorageTarget,
} from "../../../src/utils/storageTargets.js";

function createHttpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

async function assertWorkspaceOwnership(user, workspaceId) {
    try {
        const ownedWorkspace = await Workspace.findOne({
            _id: workspaceId,
            owner: user._id,
        }).select("_id");

        if (!ownedWorkspace) {
            throw createHttpError(
                403,
                "Not authorized to access files in this context",
            );
        }
    } catch (error) {
        if (error.status) {
            throw error;
        }
        throw createHttpError(
            403,
            "Not authorized to access files in this context",
        );
    }
}

export async function resolveAuthorizedMediaRouting({
    user,
    routingInput = {},
} = {}) {
    const requestedUserId =
        routingInput.userId || routingInput.userContextId || null;
    if (requestedUserId && requestedUserId !== user.contextId) {
        throw createHttpError(
            403,
            "Not authorized to access files in this context",
        );
    }

    const workspaceContextOnly =
        routingInput.contextId &&
        routingInput.contextId !== user.contextId &&
        !routingInput.workspaceId &&
        !routingInput.userId &&
        !routingInput.userContextId &&
        !routingInput.chatId &&
        !routingInput.fileScope;

    const normalizedInput = {
        ...routingInput,
        workspaceId:
            routingInput.workspaceId ||
            (workspaceContextOnly ? routingInput.contextId : null),
        fileScope:
            routingInput.fileScope ||
            (workspaceContextOnly ? "workspace-shared-legacy" : null),
    };

    const requestedContextId =
        normalizedInput.contextId ||
        (normalizedInput.fileScope === "workspace-shared-legacy"
            ? normalizedInput.workspaceId
            : requestedUserId || user.contextId);

    if (requestedContextId && requestedContextId !== user.contextId) {
        await assertWorkspaceOwnership(user, requestedContextId);
    }

    const storageTarget = resolveStorageTarget({
        ...normalizedInput,
        userId:
            normalizedInput.fileScope === "workspace-shared-legacy"
                ? null
                : requestedUserId || user.contextId,
        contextId:
            normalizedInput.fileScope === "workspace-shared-legacy"
                ? requestedContextId || normalizedInput.workspaceId
                : user.contextId,
    });

    return {
        storageTarget,
        routingParams: buildMediaHelperFileParams({ storageTarget }),
    };
}
