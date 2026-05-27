import { NextResponse } from "next/server";
import { handleError } from "../../../utils/auth";
import { getRecentChatsOfCurrentUser } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET(req) {
    try {
        const start = performance.now();
        const userChatInfo = await getRecentChatsOfCurrentUser();
        const response = NextResponse.json(userChatInfo);
        response.headers.set(
            "Server-Timing",
            `chatActiveDetail;dur=${(performance.now() - start).toFixed(1)}`,
        );
        return response;
    } catch (error) {
        return handleError(error);
    }
}
