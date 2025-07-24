import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";
import { headers } from "next/headers";

export async function HEAD(request) {
    try {
        // Check if this request is coming from the login page
        const headerList = headers();
        const referer = headerList.get("referer");

        // If coming from login page, just return 401 without triggering redirect
        if (referer && referer.includes("/auth/login")) {
            return new NextResponse(null, { status: 401 });
        }

        const user = await getCurrentUser();
        const isAuthenticated =
            user && user.userId && user.userId !== "anonymous";

        if (isAuthenticated) {
            return new NextResponse(null, { status: 200 });
        } else {
            return new NextResponse(null, { status: 401 });
        }
    } catch (error) {
        console.error("Auth status check failed:", error);
        return new NextResponse(null, { status: 401 });
    }
}

export async function GET(request) {
    try {
        const user = await getCurrentUser();
        const isAuthenticated =
            user && user.userId && user.userId !== "anonymous";

        // Check for Azure headers and local auth cookies for debugging
        const headerList = headers();
        const azureId = headerList.get("X-MS-CLIENT-PRINCIPAL-ID");
        const azureName = headerList.get("X-MS-CLIENT-PRINCIPAL-NAME");

        let localAuthInfo = null;
        try {
            const cookieStore = await import("next/headers").then((m) =>
                m.cookies(),
            );
            const tokenCookie = cookieStore.get("local_auth_token");
            if (tokenCookie?.value) {
                const token = JSON.parse(tokenCookie.value);
                localAuthInfo = {
                    hasToken: true,
                    expiresAt: token.expires_at,
                    isExpired:
                        token.expires_at &&
                        token.expires_at < Math.floor(Date.now() / 1000),
                };
            }
        } catch (error) {
            localAuthInfo = { error: error.message };
        }

        const response = {
            success: true,
            authenticated: isAuthenticated,
            user: user
                ? {
                      id: user.userId,
                      name: user.name,
                      username: user.username,
                  }
                : null,
            timestamp: new Date().toISOString(),
        };

        // Only include detailed auth info in development
        if (process.env.NODE_ENV !== "production") {
            response.authInfo = {
                azureHeaders: {
                    id: azureId,
                    name: azureName,
                },
                localAuth: localAuthInfo,
            };
        }

        return NextResponse.json(response);
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error.message,
                authenticated: false,
                timestamp: new Date().toISOString(),
            },
            { status: 500 },
        );
    }
}
