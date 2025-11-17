import authConfig from "./config/index";

if (!authConfig) {
    throw new Error("Config not found");
}

const { auth } = authConfig;

export const config = {
    // Exclude graphql, favicon, and static assets from middleware
    // Keep it minimal to avoid interfering with proxying and other routes
    matcher: "/((?!graphql|favicon\\.ico|app/assets).*)",
};

const isAuthorized = (request) => {
    if (auth?.provider === "entra") {
        const emailName = request.headers
            .get("X-MS-CLIENT-PRINCIPAL-NAME")
            ?.toLowerCase();

        // If we have Azure headers, validate domain
        if (emailName) {
            const allowedEmailDomains = process.env.ENTRA_AUTHORIZED_DOMAINS
                ? process.env.ENTRA_AUTHORIZED_DOMAINS.split(",").map(
                      (emailDomain) => emailDomain.toLowerCase(),
                  )
                : [];

            if (!allowedEmailDomains.length) {
                return false;
            }

            const emailDomain = emailName.split("@")[1];
            if (!allowedEmailDomains.includes(emailDomain)) {
                return false;
            }

            return true;
        }

        // For local development, check for local auth cookie
        if (process.env.NODE_ENV !== "production") {
            const cookieHeader = request.headers.get("cookie");
            if (cookieHeader && cookieHeader.includes("local_auth_token")) {
                // Allow local auth in development
                return true;
            }
        }

        return false;
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
