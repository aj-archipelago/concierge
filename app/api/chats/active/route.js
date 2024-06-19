import { NextResponse } from "next/server";
import { handleError } from "../../utils/auth";
import { getUserChatInfo, setActiveChatId } from "../_lib";

// Handle GET request to retrieve user chat information (both active chat IDs and the most recent active chat ID)
export async function GET(req) {
    try {
        const userChatInfo = await getUserChatInfo();
        return NextResponse.json(userChatInfo);
    } catch (error) {
        return handleError(error);
    }
}

// Handle PUT request to set activeChatId for the current user
export async function PUT(req) {
    try {
        const data = await req.json();
        const updatedActiveChatId = await setActiveChatId(
            data?.activeChatId || data,
        );
        return NextResponse.json({ activeChatId: updatedActiveChatId });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
