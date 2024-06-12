import { NextResponse } from "next/server";
import { handleError } from "../../utils/auth";
import { getActiveChatId, setActiveChatId } from "../_lib";

// Handle GET request to retrieve the active chat ID for the current user
export async function GET(req) {
    try {
        const activeChatId = await getActiveChatId();
        return NextResponse.json({ activeChatId });
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
