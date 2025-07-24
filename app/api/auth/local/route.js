import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

// Simulate Entra ID token structure more closely
const createMockToken = (email) => {
    const now = Math.floor(Date.now() / 1000);
    const userId = `mock_user_${email.replace("@", "_").replace(".", "_")}`;

    return {
        access_token: `mock_token_${uuidv4()}`,
        token_type: "Bearer",
        expires_in: 3600, // 1 hour
        expires_at: now + 3600,
        user: {
            id: userId,
            email: email,
            name: email.split("@")[0],
            username: email,
        },
        // Add Azure App Service specific fields
        azure_headers: {
            "X-MS-CLIENT-PRINCIPAL-ID": userId,
            "X-MS-CLIENT-PRINCIPAL-NAME": email,
            "X-MS-CLIENT-PRINCIPAL-IDP": "aad",
        },
    };
};

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const postLoginRedirectUrl =
        searchParams.get("post_login_redirect_url") || "/";

    if (action === "logout") {
        console.log("Logging out user - clearing auth cookies");
        // Clear all auth cookies and redirect to login page
        const response = NextResponse.redirect(
            new URL("/auth/login", request.url),
        );
        response.cookies.set("local_auth_token", "", { maxAge: 0 });
        response.cookies.set("local_auth_user", "", { maxAge: 0 });
        console.log("Auth cookies cleared, redirecting to login page");
        return response;
    }

    // Default action is login - redirect to login page
    // Don't redirect if we're already on the login page
    if (postLoginRedirectUrl.includes("/auth/login")) {
        return NextResponse.json(
            { error: "Already on login page" },
            { status: 400 },
        );
    }

    const loginUrl = `/auth/login?redirect_uri=${encodeURIComponent(postLoginRedirectUrl)}`;
    return NextResponse.redirect(new URL(loginUrl, request.url));
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { email, redirect_uri } = body;

        if (!email) {
            return NextResponse.json(
                { error: "Email is required" },
                { status: 400 },
            );
        }

        // Create mock token
        const token = createMockToken(email);

        // Set cookies
        const response = NextResponse.json({
            success: true,
            redirect_uri: redirect_uri || "/",
        });

        response.cookies.set("local_auth_token", JSON.stringify(token), {
            httpOnly: true,
            secure: false, // false for local development
            sameSite: "lax",
            maxAge: 3600, // 1 hour - match Entra session duration
        });

        response.cookies.set("local_auth_user", email, {
            httpOnly: false, // Allow client-side access
            secure: false,
            sameSite: "lax",
            maxAge: 3600 * 24 * 30, // 30 days for user preference
        });

        return response;
    } catch (error) {
        console.error("Local auth error:", error);
        return NextResponse.json(
            { error: "Authentication failed" },
            { status: 500 },
        );
    }
}
