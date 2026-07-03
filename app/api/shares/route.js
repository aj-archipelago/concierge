import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../utils/auth";
import { listOwnedSharedResources } from "../utils/listSharedResources.js";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const user = await getCurrentUser(false);
        if (!user?._id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const data = await listOwnedSharedResources(user._id);
        return NextResponse.json(data);
    } catch (error) {
        return handleError(error);
    }
}
