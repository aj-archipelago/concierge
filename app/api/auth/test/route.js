import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";

export async function GET(request) {
    try {
        // Check for mock auth cookie directly
        const cookieStore = await import("next/headers").then((m) =>
            m.cookies(),
        );
        const mockAuth = cookieStore.get("mock-auth");

        // Check Azure headers
        const headerList = await import("next/headers").then((m) =>
            m.headers(),
        );
        const azureId = headerList.get("X-MS-CLIENT-PRINCIPAL-ID");
        const azureName = headerList.get("X-MS-CLIENT-PRINCIPAL-NAME");

        const user = await getCurrentUser();

        console.log(`Auth test - user:`, user);
        console.log(`Auth test - user.userId: ${user?.userId}`);
        console.log(
            `Auth test - authenticated check: ${user && user.userId && user.userId !== "anonymous"}`,
        );

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
            mockAuthCookie: mockAuth?.value || null,
            azureHeaders: {
                id: azureId,
                name: azureName,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Auth test failed:", error);
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

        if (action === "set-mock-auth") {
            const { email } = body;
            const mockAuthValue = email ? `user:${email}` : "true";

            const response = NextResponse.json({
                success: true,
                message: `Mock authentication set${email ? ` for ${email}` : ""}`,
            });

            // Set mock auth cookie with optional user email
            response.cookies.set("mock-auth", mockAuthValue, {
                httpOnly: true,
                secure: false,
                sameSite: "lax",
                maxAge: 60 * 60 * 24, // 24 hours
            });

            return response;
        }

        if (action === "clear-mock-auth") {
            const response = NextResponse.json({
                success: true,
                message: "Mock authentication cleared",
            });

            // Clear mock auth cookie
            response.cookies.set("mock-auth", "", {
                httpOnly: true,
                secure: false,
                sameSite: "lax",
                maxAge: 0,
            });

            return response;
        }

        return NextResponse.json(
            {
                success: false,
                error: "Invalid action",
            },
            { status: 400 },
        );
    } catch (error) {
        console.error("Auth test action failed:", error);
        return NextResponse.json(
            {
                success: false,
                error: error.message,
            },
            { status: 500 },
        );
    }
}
