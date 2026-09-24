// Shared by Next routes and the native Node worker. Use the existing Cortex
// service endpoint; callers supply user context only from authenticated records.
export async function colleagueRequest(operation, variables = {}) {
    const queries = {
        draft: `query($purpose:String!,$current:String){sys_assistant_draft(purpose:$purpose,current:$current){result errors}}`,
        artifact: `query($userId:String!,$entityId:String!,$path:String!,$sha256:String!){sys_assistant_artifact(userId:$userId,entityId:$entityId,path:$path,sha256:$sha256){result errors}}`,
        manage: `query($userId:String!,$action:String,$entityId:String,$settings:String){sys_colleagues(userId:$userId,action:$action,entityId:$entityId,settings:$settings){result errors}}`,
        watch: `query($userId:String!,$entityId:String!,$path:String!){sys_colleague_watch(userId:$userId,entityId:$entityId,path:$path){result errors}}`,
        delivery: `query($acknowledgedIds:String){sys_colleague_delivery(acknowledgedIds:$acknowledgedIds){result errors}}`,
    };
    const fields = {
        draft: "sys_assistant_draft",
        artifact: "sys_assistant_artifact",
        manage: "sys_colleagues",
        watch: "sys_colleague_watch",
        delivery: "sys_colleague_delivery",
    };
    if (!queries[operation]) throw new Error("Unknown colleague operation");
    const response = await fetch(
        process.env.CORTEX_GRAPHQL_API_URL || "http://localhost:4000/graphql",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            signal: AbortSignal.timeout(
                operation === "artifact" || operation === "draft"
                    ? 120000
                    : 25000,
            ),
            body: JSON.stringify({ query: queries[operation], variables }),
        },
    );
    if (!response.ok) throw new Error("Colleague service unavailable");
    const payload = await response.json();
    const data = payload.data?.[fields[operation]];
    if (payload.errors?.length || data?.errors?.length || !data?.result)
        throw new Error("Colleague service unavailable");
    const result = JSON.parse(data.result);
    if (result.error) {
        const error = new Error(result.error);
        error.status =
            result.status ||
            (result.error === "Colleague not found" ? 404 : 400);
        throw error;
    }
    return result;
}
export function withEntityDefaults(entity, user) {
    const personal = entity.kind === "personal";
    return {
        ...entity,
        model:
            entity.model ||
            (personal && user.agentModel) ||
            "cortex-agent-chat",
        reasoningEffort:
            entity.reasoningEffort ||
            (personal && user.reasoningEffort) ||
            "low",
        memoryLearning:
            entity.memoryLearning ??
            (personal ? (user.aiMemorySelfModify ?? true) : true),
    };
}
export async function searchColleagues(user, options = {}) {
    if (!user?.contextId) throw new Error("User context is required");
    const result = await colleagueRequest("manage", {
        userId: user.contextId,
        action: "list",
        settings: JSON.stringify(options),
    });
    return {
        ...result,
        colleagues: result.colleagues.map((entity) =>
            withEntityDefaults(entity, user),
        ),
    };
}
export async function listColleagues(user, options = {}) {
    return (await searchColleagues(user, options)).colleagues;
}
export async function requireColleague(
    user,
    id,
    { runnable = false, allowArchived = false } = {},
) {
    if (!user?.contextId || typeof id !== "string" || !id || id.length > 256) {
        throw Object.assign(new Error("Colleague not found"), { status: 404 });
    }
    const colleague = await colleagueRequest("manage", {
        userId: user.contextId,
        action: "get",
        entityId: id,
    });
    if (
        !colleague ||
        colleague.id !== id ||
        (!allowArchived && colleague.status === "archived")
    ) {
        throw Object.assign(new Error("Colleague not found"), { status: 404 });
    }
    if (runnable && colleague.status !== "active") {
        throw Object.assign(new Error("Colleague is paused"), { status: 409 });
    }
    return withEntityDefaults(colleague, user);
}

export function validateTaskWatch(schedule, entityId) {
    if (schedule?.frequency !== "files") return;
    const path = schedule.watchPath;
    if (
        !entityId ||
        typeof path !== "string" ||
        !/^\/workspace\/[^/]+/.test(path) ||
        path.length > 512 ||
        [...path].some((character) => character.charCodeAt(0) < 32) ||
        path.split("/").some((p) => p.startsWith(".")) ||
        path.startsWith("/workspace/files")
    ) {
        const error = new Error(
            "Choose a colleague and a folder inside /workspace for file monitoring",
        );
        error.status = 400;
        throw error;
    }
}
