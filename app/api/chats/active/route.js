import { NextResponse } from "next/server";
import { handleError } from "../../utils/auth";
import { getUserChatInfo, setActiveChatId } from "../_lib";

// Handle GET request to retrieve user chat information (both recent chat IDs and the most recent active chat ID)
export async function GET(req) {
    try {
        const start = performance.now();
        const userChatInfo = await getUserChatInfo();
        const response = NextResponse.json(userChatInfo);
        response.headers.set(
            "Server-Timing",
            `chatActive;dur=${(performance.now() - start).toFixed(1)}`,
        );
        return response;
    } catch (error) {
        return handleError(error);
    }
}

// Handle PUT request to set activeChatId for the current user
export async function PUT(req) {
    try {
        const start = performance.now();
        const data = await req.json();
        const updatedActiveChatId = await setActiveChatId(
            data?.activeChatId || data,
        );
        const response = NextResponse.json(updatedActiveChatId);
        response.headers.set(
            "Server-Timing",
            `chatSetActive;dur=${(performance.now() - start).toFixed(1)}`,
        );
        return response;
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
