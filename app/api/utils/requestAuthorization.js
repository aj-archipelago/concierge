import authConfig from "../../../config/index";
import {
    getEntraPrincipalLogContext,
    isTenantAuthorized,
    parseAuthorizedTenantIds,
    resolveEntraTenantId,
} from "./entraPrincipal";

if (!authConfig) {
    throw new Error("Config not found");
}

const { auth } = authConfig;

const logUnauthorizedEntraRequest = (
    request,
    reason,
    resolvedEmail = null,
    authContext = {},
) => {
    console.warn("Unauthorized Entra request blocked", {
        reason,
        ...getEntraPrincipalLogContext(request.headers, resolvedEmail),
        ...authContext,
    });
};

const hasLocalAuthCookie = (request) => {
    if (process.env.NODE_ENV === "production") {
        return false;
    }

    const cookieHeader = request.headers.get("cookie");
    return Boolean(cookieHeader?.includes("local_auth_token"));
};

export const isRequestAuthorized = (request) => {
    if (auth?.provider === "entra") {
        if (hasLocalAuthCookie(request)) {
            return true;
        }

        const allowedTenantIds = parseAuthorizedTenantIds(
            process.env.ENTRA_AUTHORIZED_TENANT_IDS,
        );
        if (!allowedTenantIds.length) {
            logUnauthorizedEntraRequest(request, "missing_authorized_tenants");
            return false;
        }

        const tenantId = resolveEntraTenantId(request.headers);

        if (!isTenantAuthorized(tenantId, allowedTenantIds)) {
            logUnauthorizedEntraRequest(
                request,
                "tenant_not_authorized",
                null,
                {
                    allowedTenantIds,
                },
            );
            return false;
        }

        return true;
    }

    return true;
};
