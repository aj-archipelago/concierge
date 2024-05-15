import authConfig from "./config/index";

if (!authConfig) {
    throw new Error("Config not found");
}

const { auth } = authConfig;

export const config = {
    matcher: '/((?!graphql).*)',
};

const isAuthorized = (request) => {
    if (auth?.provider === "entra") {
        const emailName = request.headers
            .get("X-MS-CLIENT-PRINCIPAL-NAME")
            ?.toLowerCase();

        const allowedEmailDomains = process.env.ENTRA_AUTHORIZED_DOMAINS
            ? process.env.ENTRA_AUTHORIZED_DOMAINS.split(",").map(
                  (emailDomain) => emailDomain.toLowerCase(),
              )
            : [];

        if (!emailName || !allowedEmailDomains.length) {
            return false;
        }

        const emailDomain = emailName.split("@")[1];
        if (!allowedEmailDomains.includes(emailDomain)) {
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
