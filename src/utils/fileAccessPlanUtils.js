import { buildAppletUserContextId } from "./storageTargets.js";

export const FILE_ACCESS_TARGET_KINDS = Object.freeze({
    CHAT: "chat",
    USER_FILES: "user-files",
    USER_GLOBAL: "user-global",
    APP_PRIVATE: "app-private",
    APP_SHARED: "app-shared",
});

function createFileAccessTarget({
    kind,
    userContextId = null,
    workspaceId = null,
    appletId = null,
    chatId = null,
    contextKey = null,
    write = false,
}) {
    return {
        kind,
        ...(userContextId ? { userContextId } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        ...(appletId ? { appletId } : {}),
        ...(chatId ? { chatId } : {}),
        ...(contextKey ? { contextKey } : {}),
        ...(write ? { write: true } : {}),
    };
}

export function buildFileAccessPlan({
    appletId = null,
    workspaceId = null,
    userContextId = null,
    userContextKey = null,
    workspaceContextKey = null,
    chatId = null,
    includeUserGlobal = true,
    includeUserFiles = includeUserGlobal,
}) {
    const targets = [];

    const addUserFilesReadTarget = () => {
        if (!includeUserFiles || !userContextId) {
            return;
        }
        targets.push(
            createFileAccessTarget({
                kind: FILE_ACCESS_TARGET_KINDS.USER_FILES,
                userContextId,
                contextKey: userContextKey,
            }),
        );
    };

    if (chatId && userContextId) {
        targets.push(
            createFileAccessTarget({
                kind: FILE_ACCESS_TARGET_KINDS.CHAT,
                userContextId,
                chatId,
                contextKey: userContextKey,
                write: true,
            }),
        );

        addUserFilesReadTarget();

        if (includeUserGlobal && !includeUserFiles) {
            targets.push(
                createFileAccessTarget({
                    kind: FILE_ACCESS_TARGET_KINDS.USER_GLOBAL,
                    userContextId,
                    contextKey: userContextKey,
                }),
            );
        }

        return targets;
    }

    if (appletId) {
        if (!userContextId) {
            return targets;
        }

        targets.push(
            createFileAccessTarget({
                kind: FILE_ACCESS_TARGET_KINDS.APP_PRIVATE,
                userContextId,
                workspaceId,
                appletId,
                contextKey: userContextKey,
                write: true,
            }),
        );

        targets.push(
            createFileAccessTarget({
                kind: FILE_ACCESS_TARGET_KINDS.APP_SHARED,
                workspaceId,
                appletId,
                contextKey: workspaceContextKey,
            }),
        );

        if (includeUserGlobal) {
            if (includeUserFiles) {
                addUserFilesReadTarget();
            } else {
                targets.push(
                    createFileAccessTarget({
                        kind: FILE_ACCESS_TARGET_KINDS.USER_GLOBAL,
                        userContextId,
                        contextKey: userContextKey,
                    }),
                );
            }
        }

        return targets;
    }

    if (workspaceId) {
        targets.push(
            createFileAccessTarget({
                kind: FILE_ACCESS_TARGET_KINDS.APP_SHARED,
                workspaceId,
                contextKey: workspaceContextKey,
                write: true,
            }),
        );

        if (includeUserGlobal && userContextId) {
            if (includeUserFiles) {
                addUserFilesReadTarget();
            } else {
                targets.push(
                    createFileAccessTarget({
                        kind: FILE_ACCESS_TARGET_KINDS.USER_GLOBAL,
                        userContextId,
                        contextKey: userContextKey,
                    }),
                );
            }
        }

        return targets;
    }

    if (userContextId) {
        targets.push(
            createFileAccessTarget({
                kind: FILE_ACCESS_TARGET_KINDS.USER_GLOBAL,
                userContextId,
                contextKey: userContextKey,
                write: true,
            }),
        );
    }

    return targets;
}

export function buildRunContext({
    appletId = null,
    workspaceId = null,
    workspaceContextKey = null,
    userContextId = null,
    userContextKey = null,
}) {
    if (appletId) {
        if (!userContextId) {
            return {
                contextId: "",
                contextKey: "",
            };
        }

        return {
            contextId: buildAppletUserContextId(userContextId, appletId),
            contextKey: userContextKey || "",
        };
    }

    if (workspaceId) {
        return {
            contextId: workspaceId,
            contextKey: workspaceContextKey || "",
        };
    }

    if (userContextId) {
        return {
            contextId: userContextId,
            contextKey: userContextKey || "",
        };
    }

    return {
        contextId: "",
        contextKey: "",
    };
}
