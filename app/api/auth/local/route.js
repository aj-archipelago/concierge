import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * 60 * 60;
const LOCAL_AUTH_TTL_SECONDS = IS_PRODUCTION
    ? ONE_HOUR_SECONDS
    : ONE_DAY_SECONDS;

// Simulate Entra ID token structure more closely
const createMockToken = (email) => {
    const now = Math.floor(Date.now() / 1000);
    const userId = `mock_user_${email.replace("@", "_").replace(".", "_")}`;

    return {
        access_token: `mock_token_${uuidv4()}`,
        token_type: "Bearer",
        expires_in: LOCAL_AUTH_TTL_SECONDS,
        expires_at: now + LOCAL_AUTH_TTL_SECONDS,
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
        // Clear all auth cookies and redirect to login page
        const response = NextResponse.redirect(
            new URL("/auth/login", request.url),
        );
        response.cookies.set("local_auth_token", "", { maxAge: 0 });
        response.cookies.set("local_auth_user", "", { maxAge: 0 });
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
            user: email, // Include user email in response for localStorage
        });

        response.cookies.set("local_auth_token", JSON.stringify(token), {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: "lax",
            maxAge: LOCAL_AUTH_TTL_SECONDS,
        });

        return response;
    } catch (error) {
        return NextResponse.json(
            { error: "Authentication failed" },
            { status: 500 },
        );
    }
}
