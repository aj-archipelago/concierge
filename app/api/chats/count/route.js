import { NextResponse } from "next/server";
import { handleError } from "../../utils/auth";
import { getTotalChatCount } from "../_lib";

// Handle GET request to fetch total chat count for the current user
export async function GET() {
    try {
        const totalCount = await getTotalChatCount();
        return NextResponse.json(totalCount);
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
