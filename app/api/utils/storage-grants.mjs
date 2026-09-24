import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const principalContext = new AsyncLocalStorage();
export const STORAGE_ACTIONS = ["list", "read", "upload", "rename", "delete"];
export const grantsEnabled = () => Boolean(process.env.CFH_GRANT_PRIVATE_KEY);
export const withStoragePrincipal = (user, callback) =>
    principalContext.run(user, callback);
export const storageClientName = () =>
    process.env.CFH_CLIENT_NAME ||
    (principalContext.getStore() ? "concierge-worker" : "concierge-web");

export async function storagePrincipal() {
    const bound = principalContext.getStore();
    if (bound) return bound;
    const { getCurrentUser } = await import("./auth.js");
    return getCurrentUser(false);
}

// Only server-authorized targets enter this function. No browser endpoint
// accepts a ready-made targets array. JWTs carry no context/encryption keys.
export function signStorageGrant(
    user,
    targets,
    { processFiles = false, ttlSeconds = 3600 } = {},
) {
    if (!user?.contextId)
        throw Object.assign(new Error("Authentication required"), {
            status: 401,
        });
    const {
        CFH_GRANT_PRIVATE_KEY: key,
        CFH_GRANT_KEY_ID: kid,
        CFH_GRANT_ISSUER: issuer,
        CFH_GRANT_AUDIENCE: audience,
    } = process.env;
    if (!key || !kid || !issuer || !audience)
        throw new Error("Storage grant signing is not configured");
    if (!Array.isArray(targets) || !targets.length || targets.length > 32)
        throw new Error("Invalid storage grant targets");
    const safeTargets = targets.map(({ owner, prefix, path, actions }) => {
        if (
            typeof owner !== "string" ||
            !/^[A-Za-z0-9:_-]{1,160}$/.test(owner) ||
            (path !== undefined && prefix !== undefined) ||
            typeof (path ?? prefix) !== "string" ||
            (path ?? prefix).length > 1024 ||
            (path ?? prefix).startsWith("/") ||
            /[\\\u0000-\u001f\u007f]/.test(path ?? prefix) ||
            (path ?? prefix).split("/").some((p) => p === "." || p === "..") ||
            (path !== undefined ? !path : prefix && !prefix.endsWith("/")) ||
            !Array.isArray(actions) ||
            !actions.length ||
            actions.some((a) => !STORAGE_ACTIONS.includes(a))
        )
            throw new Error("Invalid storage grant target");
        return {
            owner,
            ...(path !== undefined ? { path } : { prefix }),
            actions: [...new Set(actions)],
        };
    });
    return jwt.sign(
        { v: 1, targets: safeTargets, processFiles: processFiles === true },
        key,
        {
            algorithm: "RS256",
            keyid: kid,
            issuer,
            audience,
            subject: user.contextId,
            jwtid: randomUUID(),
            expiresIn: Math.max(1, Math.min(3600, ttlSeconds)),
        },
    );
}
