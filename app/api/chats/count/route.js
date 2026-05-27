import { NextResponse } from "next/server";
import { handleError } from "../../utils/auth";
import { getTotalChatCount } from "../_lib";

// Handle GET request to fetch total chat count for the current user
export async function GET() {
    try {
        const start = performance.now();
        const totalCount = await getTotalChatCount();
        const response = NextResponse.json(totalCount);
        response.headers.set(
            "Server-Timing",
            `chatCount;dur=${(performance.now() - start).toFixed(1)}`,
        );
        return response;
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
