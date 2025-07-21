import { NextResponse } from "next/server";

export async function GET(request) {
    // This endpoint simulates Azure App Service authentication for local development
    const { searchParams } = new URL(request.url);
    let redirectUrl = searchParams.get("redirect_uri") || "/";

    // Add auth_return parameter to indicate successful authentication
    const redirectUrlObj = new URL(redirectUrl, request.url);
    redirectUrlObj.searchParams.set("auth_return", "true");
    redirectUrl = redirectUrlObj.toString();

    // Create a redirect response
    const response = NextResponse.redirect(new URL(redirectUrl, request.url));

    // Add a cookie to indicate mock authentication
    response.cookies.set("mock-auth", "true", {
        httpOnly: true,
        secure: false, // false for local development
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
}

export async function POST(request) {
    // Handle mock login
    const body = await request.json();
    const { email = "test@example.com" } = body;

    const response = NextResponse.json({
        success: true,
        message: "Mock authentication successful",
        user: {
            id: "mock-user-id-123",
            email: email,
            name: "Test User",
        },
    });

    // Add mock authentication headers
    response.headers.set("X-MS-CLIENT-PRINCIPAL-ID", "mock-user-id-123");
    response.headers.set("X-MS-CLIENT-PRINCIPAL-NAME", email);
    response.headers.set("X-MS-CLIENT-PRINCIPAL-IDP", "aad");

    // Add a cookie to indicate mock authentication
    response.cookies.set("mock-auth", "true", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
}
