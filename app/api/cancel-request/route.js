import { NextResponse } from "next/server";
import { getCurrentUser } from "../utils/auth";
import { cancelTask } from "../utils/task-utils";

export async function POST(req) {
    try {
        const { _id } = await req.json();
        const user = await getCurrentUser();

        await cancelTask(_id, user._id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Cancel request error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
