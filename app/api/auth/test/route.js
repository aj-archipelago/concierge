import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";

export async function GET(request) {
    try {
        // Check for local auth token
        const cookieStore = await import("next/headers").then((m) =>
            m.cookies(),
        );
        const localAuthToken = cookieStore.get("local_auth_token");

        // Check Azure headers
        const headerList = await import("next/headers").then((m) =>
            m.headers(),
        );
        const azureId = headerList.get("X-MS-CLIENT-PRINCIPAL-ID");
        const azureName = headerList.get("X-MS-CLIENT-PRINCIPAL-NAME");

        const user = await getCurrentUser();

        return NextResponse.json({
            success: true,
            authenticated: user && user.userId && user.userId !== "anonymous",
            user: user
                ? {
                      id: user.userId,
                      name: user.name,
                      username: user.username,
                  }
                : null,
            localAuth: {
                hasToken: !!localAuthToken?.value,
            },
            azureHeaders: {
                id: azureId,
                name: azureName,
            },
            timestamp: new Date().toISOString(),
        });
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

export async function POST(request) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === "clear-local-auth") {
            const response = NextResponse.json({
                success: true,
                message: "Local authentication cleared",
            });

            // Clear local auth token
            response.cookies.set("local_auth_token", "", {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 0,
            });

            return response;
        }

        if (action === "trigger-auth-refresh") {
            const response = NextResponse.json({
                success: true,
                message: "Authentication refresh triggered",
                redirectUrl: "/api/auth/local",
            });

            return response;
        }

        return NextResponse.json(
            {
                success: false,
                error: "Invalid action. Use 'clear-local-auth' or 'trigger-auth-refresh'",
            },
            { status: 400 },
        );
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error.message,
            },
            { status: 500 },
        );
    }
}
