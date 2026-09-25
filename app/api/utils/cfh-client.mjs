import {
    grantsEnabled,
    signStorageGrant,
    storagePrincipal,
    storageClientName,
} from "./storage-grants.mjs";

const ROUTING = [
    "contextId",
    "userId",
    "workspaceId",
    "appletId",
    "chatId",
    "fileScope",
];

export function mediaRequestParameters(url, options = {}) {
    const query = Object.fromEntries(new URL(url).searchParams);
    let body = {};
    if (typeof options.body === "string") {
        try {
            body = JSON.parse(options.body);
        } catch {
            /* Upstream validates malformed bodies. */
        }
    } else if (options.body?.entries) {
        body = Object.fromEntries(
            [...options.body.entries()].filter(
                ([, value]) => typeof value === "string",
            ),
        );
    }
    body = body?.params || body || {};
    return options.method?.toUpperCase() === "GET" || !options.method
        ? { ...body, ...query }
        : { ...query, ...body };
}

export function mediaRequestAction(params, method = "GET") {
    const enabled = (value) => value === true || value === "true";
    if (enabled(params.save)) return "upload";
    if (enabled(params.checkHash)) return "read";
    if (enabled(params.rename) || params.operation === "rename")
        return "rename";
    if (
        enabled(params.clearHash) ||
        method.toUpperCase() === "DELETE" ||
        params.operation === "delete"
    )
        return "delete";
    if (
        enabled(params.listFolder) ||
        enabled(params.listNames) ||
        ["listFolder", "listNames"].includes(params.operation)
    )
        return "list";
    if (
        params.fetch ||
        params.load ||
        params.restore ||
        enabled(params.save) ||
        method.toUpperCase() === "POST"
    )
        return "upload";
    return "read";
}

export async function authorizedMediaFetch(
    input,
    options = {},
    authorization = {},
) {
    if (!grantsEnabled()) {
        const headers = new Headers(options.headers);
        headers.set("x-cfh-client", storageClientName());
        return fetch(input, { ...options, headers });
    }
    const { grantTargetForRouting, resolveAuthorizedMediaRouting } =
        await import("./file-route-utils.js");
    const url = new URL(input);
    const endpoint = new URL(process.env.CORTEX_MEDIA_API_URL);
    if (url.origin !== endpoint.origin || url.pathname !== endpoint.pathname)
        throw new Error(
            "Refusing to send a storage grant to an unconfigured endpoint",
        );
    const params = mediaRequestParameters(url, options);
    const action = mediaRequestAction(params, options.method);
    const user = authorization.user || (await storagePrincipal());
    const { routingParams } = authorization.targets
        ? { routingParams: authorization.routing }
        : await resolveAuthorizedMediaRouting({
              user,
              action,
              routingInput: authorization.routing || {
                  ...params,
                  ...(!params.fileScope && (params.blobPath || params.blobPaths)
                      ? { fileScope: "all" }
                      : {}),
              },
          });
    // Add canonical routing for query-only clients. Multipart/JSON fields are
    // independently checked against the signed scope by CFH.
    for (const key of ROUTING) url.searchParams.delete(key);
    for (const [key, value] of Object.entries(routingParams))
        url.searchParams.set(key, value);
    const headers = new Headers(options.headers);
    headers.delete("x-cfh-grant");
    headers.set("x-cfh-client", storageClientName());
    if (grantsEnabled())
        headers.set(
            "x-cfh-grant",
            signStorageGrant(
                user,
                authorization.targets || [
                    grantTargetForRouting(routingParams, [action]),
                ],
                { processFiles: !authorization.targets },
            ),
        );
    return fetch(url, { ...options, headers, redirect: "manual" });
}
