import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";
import { markNotificationsRead } from "../../utils/inbox.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
    try {
        const user = await getCurrentUser();
        const body = await request.json();
        const all = body?.all === true;
        const ids = Array.isArray(body?.ids) ? body.ids : [];

        const result = await markNotificationsRead(user._id, { ids, all });

        return NextResponse.json({
            success: true,
            modifiedCount: result.modifiedCount,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
