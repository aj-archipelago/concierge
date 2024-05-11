import authConfig from "./config/index";

if (!authConfig) {
    throw new Error("Config not found");
}

const { auth } = authConfig;

export const config = {
    matcher: "/:path*",
};

const isAuthorized = (request) => {
    if (auth?.provider === "entra") {
        const tenantId = request.headers
            .get("X-MS-CLIENT-PRINCIPAL-TENANT-ID")
            ?.toLowerCase();

        const allowedTenantIds = process.env.ENTRA_AUTHORIZED_TENANTS
            ? process.env.ENTRA_AUTHORIZED_TENANTS.split(",").map((tenantId) =>
                  tenantId.toLowerCase(),
              )
            : [];

        if (!tenantId || !allowedTenantIds.includes(tenantId)) {
            return false;
        }
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
