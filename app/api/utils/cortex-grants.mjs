import {
    grantsEnabled,
    signStorageGrant,
    storagePrincipal,
    STORAGE_ACTIONS,
} from "./storage-grants.mjs";

export async function grantForCortexRun(user, variables = {}) {
    const { grantTargetForRouting, resolveAuthorizedMediaRouting } =
        await import("./file-route-utils.js");
    const targets = [];
    const plan = variables.fileAccessPlan;
    if (plan != null && (!Array.isArray(plan) || plan.length > 24))
        throw Object.assign(new Error("Invalid file access plan"), {
            status: 403,
        });
    for (const target of plan || []) {
        const scopes = {
            chat: "chat",
            "user-files": "all",
            "user-global": "global",
            "app-private": "applet-user",
            "app-shared": target.appletId
                ? "applet-shared"
                : "workspace-shared-legacy",
        };
        if (!Object.hasOwn(scopes, target.kind))
            throw Object.assign(new Error("Invalid file access target"), {
                status: 403,
            });
        const { routingParams } = await resolveAuthorizedMediaRouting({
            user,
            action: target.write ? "upload" : "read",
            routingInput: {
                userId: target.userContextId,
                workspaceId: target.workspaceId,
                appletId: target.appletId,
                chatId: target.chatId,
                fileScope: scopes[target.kind],
            },
        });
        targets.push(
            grantTargetForRouting(
                routingParams,
                target.write ? STORAGE_ACTIONS : ["read", "list"],
            ),
        );
    }
    const attachedContexts = new Set(
        variables.agentContext ? [variables.agentContext] : [],
    );
    if (variables.entityId) {
        const { requireColleague } = await import("./colleagues.js");
        const assistant = await requireColleague(
            user,
            variables.entityId,
        ).catch((error) => {
            if (error.status === 404) return null;
            throw error;
        });
        if (assistant?.agentContext)
            attachedContexts.add(assistant.agentContext);
    }
    for (const attachedContext of attachedContexts) {
        const match = /^applet-shared:([a-fA-F0-9]{24})$/.exec(attachedContext);
        if (!match)
            throw Object.assign(new Error("Invalid attached file context"), {
                status: 403,
            });
        const { routingParams } = await resolveAuthorizedMediaRouting({
            user,
            action: "read",
            routingInput: { appletId: match[1], fileScope: "applet-shared" },
        });
        targets.push(grantTargetForRouting(routingParams, ["read", "list"]));
    }
    // Non-agent media/transcription calls still need access to their owner's
    // inputs and a scoped output location. Their owner is established server-side.
    if (!targets.length)
        targets.push({
            owner: user.contextId,
            prefix: "",
            actions: STORAGE_ACTIONS,
        });
    return signStorageGrant(user, targets, { processFiles: true });
}

export async function cortexGrantFetch(url, options = {}) {
    if (!grantsEnabled()) return fetch(url, options);
    const user = await storagePrincipal();
    if (!user?._id || !user.contextId)
        throw Object.assign(new Error("Authentication required"), {
            status: 401,
        });
    let body;
    try {
        body = JSON.parse(options.body);
    } catch {
        throw Object.assign(new Error("Invalid Cortex request"), {
            status: 400,
        });
    }
    if (!body || Array.isArray(body))
        throw Object.assign(
            new Error("Batched Cortex requests are not supported"),
            { status: 400 },
        );
    const headers = new Headers(options.headers);
    headers.set(
        "x-cfh-grant",
        await grantForCortexRun(user, body.variables || {}),
    );
    return fetch(url, { ...options, headers, redirect: "manual" });
}
