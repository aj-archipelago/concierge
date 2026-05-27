import authConfig from "./config/index";
import {
    getEntraPrincipalLogContext,
    isTenantAuthorized,
    parseAuthorizedTenantIds,
    resolveEntraTenantId,
} from "./app/api/utils/entraPrincipal";

if (!authConfig) {
    throw new Error("Config not found");
}

const { auth } = authConfig;

export const config = {
    matcher: "/((?!graphql).*)",
};

const logUnauthorizedEntraRequest = (
    request,
    reason,
    resolvedEmail = null,
    authContext = {},
) => {
    console.warn("Unauthorized Entra request blocked by middleware", {
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

const isAuthorized = (request) => {
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

export function middleware(request) {
    if (!isAuthorized(request)) {
        return Response.json(
            { success: false, message: "Unauthorized" },
            { status: 401 },
        );
    }
}
