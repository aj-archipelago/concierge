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

        return NextResponse.json({
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
        });
    } catch (error) {
        console.error("Auth status check failed:", error);
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
