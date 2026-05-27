export const STORAGE_TARGET_KINDS = Object.freeze({
    USER_GLOBAL: "user-global",
    MEDIA: "media",
    CHAT: "chat",
    APPLET_USER: "applet-user",
    APPLET_SHARED: "applet-shared",
    APPLET_GLOBAL: "applet-global",
    APPLET_PUBLISHED: "applet-published",
    WORKSPACE_PRIVATE: "workspace-private",
    WORKSPACE_SHARED: "workspace-shared",
    PROFILE: "profile",
    ARTICLE: "article",
    SKILL: "skill",
    AUTOMATION: "automation",
});

const USER_SCOPED_KINDS = new Set([
    STORAGE_TARGET_KINDS.USER_GLOBAL,
    STORAGE_TARGET_KINDS.MEDIA,
    STORAGE_TARGET_KINDS.CHAT,
    STORAGE_TARGET_KINDS.APPLET_USER,
    STORAGE_TARGET_KINDS.APPLET_GLOBAL,
    STORAGE_TARGET_KINDS.WORKSPACE_PRIVATE,
    STORAGE_TARGET_KINDS.PROFILE,
    STORAGE_TARGET_KINDS.ARTICLE,
    STORAGE_TARGET_KINDS.SKILL,
    STORAGE_TARGET_KINDS.AUTOMATION,
]);

const APPLET_SCOPED_KINDS = new Set([
    STORAGE_TARGET_KINDS.APPLET_USER,
    STORAGE_TARGET_KINDS.APPLET_SHARED,
]);

const FILE_SCOPE_BY_KIND = Object.freeze({
    [STORAGE_TARGET_KINDS.USER_GLOBAL]: "global",
    [STORAGE_TARGET_KINDS.MEDIA]: "media",
    [STORAGE_TARGET_KINDS.CHAT]: "chat",
    [STORAGE_TARGET_KINDS.APPLET_USER]: "applet-user",
    [STORAGE_TARGET_KINDS.APPLET_SHARED]: "applet-shared",
    [STORAGE_TARGET_KINDS.APPLET_GLOBAL]: "applets",
    [STORAGE_TARGET_KINDS.APPLET_PUBLISHED]: "applets",
    [STORAGE_TARGET_KINDS.WORKSPACE_PRIVATE]: "workspace-user-legacy",
    [STORAGE_TARGET_KINDS.WORKSPACE_SHARED]: "workspace-shared-legacy",
    [STORAGE_TARGET_KINDS.PROFILE]: "profile",
    [STORAGE_TARGET_KINDS.ARTICLE]: "articles",
    [STORAGE_TARGET_KINDS.SKILL]: "skills",
    [STORAGE_TARGET_KINDS.AUTOMATION]: "automations",
});

function cleanObject(object) {
    return Object.fromEntries(
        Object.entries(object).filter(
            ([, value]) => value != null && value !== "",
        ),
    );
}

function toNullableString(value) {
    return value == null || value === "" ? null : String(value);
}

export function buildAppletUserContextId(userContextId, appletId) {
    const resolvedUserContextId = toNullableString(userContextId);
    const resolvedAppletId = toNullableString(appletId);
    if (!resolvedUserContextId || !resolvedAppletId) {
        return null;
    }
    return `applet-user:${resolvedAppletId}:${resolvedUserContextId}`;
}

export function buildAppletSharedContextId(appletId) {
    const resolvedAppletId = toNullableString(appletId);
    if (!resolvedAppletId) {
        return null;
    }
    return `applet-shared:${resolvedAppletId}`;
}

function inferStorageTargetKind({
    kind = null,
    fileScope = null,
    chatId = null,
    workspaceId = null,
    appletId = null,
    isArtifact = false,
} = {}) {
    if (kind) {
        return kind;
    }

    if (fileScope === "applet-user") {
        return STORAGE_TARGET_KINDS.APPLET_USER;
    }
    if (fileScope === "applet-shared") {
        return STORAGE_TARGET_KINDS.APPLET_SHARED;
    }
    if (
        fileScope === "workspace-shared-legacy" ||
        (isArtifact && workspaceId)
    ) {
        return STORAGE_TARGET_KINDS.WORKSPACE_SHARED;
    }
    if (fileScope === "workspace-user-legacy") {
        return STORAGE_TARGET_KINDS.WORKSPACE_PRIVATE;
    }
    if (fileScope === "chat" || chatId) {
        return STORAGE_TARGET_KINDS.CHAT;
    }
    if (fileScope === "media") {
        return STORAGE_TARGET_KINDS.MEDIA;
    }
    if (fileScope === "profile") {
        return STORAGE_TARGET_KINDS.PROFILE;
    }
    if (fileScope === "articles") {
        return STORAGE_TARGET_KINDS.ARTICLE;
    }
    if (fileScope === "applets") {
        return STORAGE_TARGET_KINDS.APPLET_GLOBAL;
    }
    if (appletId && isArtifact) {
        return STORAGE_TARGET_KINDS.APPLET_SHARED;
    }
    if (appletId) {
        return STORAGE_TARGET_KINDS.APPLET_USER;
    }
    if (fileScope === "skills") {
        return STORAGE_TARGET_KINDS.SKILL;
    }
    if (fileScope === "automations") {
        return STORAGE_TARGET_KINDS.AUTOMATION;
    }
    if (workspaceId) {
        return STORAGE_TARGET_KINDS.WORKSPACE_PRIVATE;
    }

    return STORAGE_TARGET_KINDS.USER_GLOBAL;
}

export function createStorageTarget(kind, options = {}) {
    return cleanObject({
        kind,
        contextId: options.contextId,
        userContextId: options.userContextId,
        workspaceId: options.workspaceId,
        appletId: options.appletId,
        chatId: options.chatId,
    });
}

export function createUserGlobalStorageTarget(userContextId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.USER_GLOBAL, {
        userContextId,
    });
}

export function createChatStorageTarget(userContextId, chatId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.CHAT, {
        userContextId,
        chatId,
    });
}

export function createAppletUserStorageTarget(userContextId, appletId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.APPLET_USER, {
        userContextId,
        appletId,
    });
}

export function createAppletSharedStorageTarget(appletId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.APPLET_SHARED, {
        appletId,
    });
}

export function createMediaStorageTarget(userContextId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.MEDIA, {
        userContextId,
    });
}

export function createWorkspacePrivateStorageTarget(
    userContextId,
    workspaceId,
) {
    return createStorageTarget(STORAGE_TARGET_KINDS.WORKSPACE_PRIVATE, {
        userContextId,
        workspaceId,
    });
}

export function createWorkspaceSharedStorageTarget(workspaceId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.WORKSPACE_SHARED, {
        workspaceId,
    });
}

export function createProfileStorageTarget(userContextId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.PROFILE, {
        userContextId,
    });
}

export function createArticleStorageTarget(userContextId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.ARTICLE, {
        userContextId,
    });
}

export function createAppletGlobalStorageTarget(userContextId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.APPLET_GLOBAL, {
        userContextId,
    });
}

export function createAppletPublishedStorageTarget(contextId = null) {
    return createStorageTarget(STORAGE_TARGET_KINDS.APPLET_PUBLISHED, {
        contextId,
    });
}

export function createSkillStorageTarget(userContextId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.SKILL, {
        userContextId,
    });
}

export function createAutomationStorageTarget(userContextId) {
    return createStorageTarget(STORAGE_TARGET_KINDS.AUTOMATION, {
        userContextId,
    });
}
export function resolveStorageTarget(input = {}) {
    const target = input.storageTarget || input.target || input;
    const kind = inferStorageTargetKind({
        kind: target.kind ?? input.kind,
        fileScope: target.fileScope ?? input.fileScope,
        chatId: target.chatId ?? input.chatId,
        workspaceId: target.workspaceId ?? input.workspaceId,
        appletId: target.appletId ?? input.appletId,
        isArtifact: target.isArtifact ?? input.isArtifact,
    });

    const userContextIdHint =
        target.userContextId ??
        target.userId ??
        input.userContextId ??
        input.userId;
    const contextIdHint = target.contextId ?? input.contextId;
    const workspaceIdHint =
        target.workspaceId ??
        input.workspaceId ??
        (kind === STORAGE_TARGET_KINDS.WORKSPACE_SHARED ? contextIdHint : null);
    const appletIdHint =
        target.appletId ??
        input.appletId ??
        (APPLET_SCOPED_KINDS.has(kind) ? workspaceIdHint : null);
    const chatIdHint = target.chatId ?? input.chatId;

    const userContextId = USER_SCOPED_KINDS.has(kind)
        ? toNullableString(userContextIdHint ?? contextIdHint)
        : null;
    const workspaceId = toNullableString(workspaceIdHint);
    const appletId = APPLET_SCOPED_KINDS.has(kind)
        ? toNullableString(appletIdHint)
        : null;
    const chatId =
        kind === STORAGE_TARGET_KINDS.CHAT
            ? toNullableString(chatIdHint)
            : null;
    const fileScope = FILE_SCOPE_BY_KIND[kind] || "global";
    let resolvedContextId = userContextId;
    if (kind === STORAGE_TARGET_KINDS.WORKSPACE_SHARED) {
        resolvedContextId = workspaceId;
    } else if (kind === STORAGE_TARGET_KINDS.APPLET_USER) {
        resolvedContextId = buildAppletUserContextId(userContextId, appletId);
    } else if (kind === STORAGE_TARGET_KINDS.APPLET_SHARED) {
        resolvedContextId = buildAppletSharedContextId(appletId);
    } else if (kind === STORAGE_TARGET_KINDS.APPLET_PUBLISHED) {
        resolvedContextId =
            toNullableString(contextIdHint) ||
            toNullableString(
                typeof process !== "undefined"
                    ? process.env.CONCIERGE_PUBLISHED_APPLETS_CONTEXT_ID
                    : null,
            ) ||
            "concierge-published-applets";
    }

    return {
        kind,
        userContextId,
        workspaceId,
        appletId,
        chatId,
        fileScope,
        contextId: resolvedContextId,
    };
}

export function getStorageContextId(input = {}) {
    return resolveStorageTarget(input).contextId;
}

export function buildMediaHelperFileParams(input = {}) {
    const resolved = resolveStorageTarget(input);
    return cleanObject({
        contextId: resolved.contextId,
        userId: resolved.userContextId,
        workspaceId: resolved.workspaceId,
        appletId: resolved.appletId,
        chatId: resolved.chatId,
        fileScope: resolved.fileScope,
    });
}

export function buildMediaHelperListParams({
    storageTarget = null,
    userContextId = null,
    contextId = null,
    fileScope = "all",
    workspaceId = null,
    appletId = null,
    chatId = null,
} = {}) {
    if (storageTarget) {
        const resolved = resolveStorageTarget({ storageTarget });
        return cleanObject({
            userId: resolved.userContextId || resolved.contextId,
            fileScope: resolved.fileScope,
            workspaceId: resolved.workspaceId,
            appletId: resolved.appletId,
            chatId: resolved.chatId,
        });
    }

    return cleanObject({
        userId: toNullableString(userContextId ?? contextId),
        fileScope,
        workspaceId: toNullableString(workspaceId),
        appletId: toNullableString(appletId),
        chatId: toNullableString(chatId),
    });
}
