import RequestProgress from "../models/request-progress";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../utils/auth";

export async function GET(request) {
    try {
        const user = await getCurrentUser();
        const { searchParams } = new URL(request.url);
        const showDismissed = searchParams.get("showDismissed") === "true";
        const page = parseInt(searchParams.get("page")) || 1;
        const limit = parseInt(searchParams.get("limit")) || 10;

        const query = {
            owner: user._id,
        };

        if (!showDismissed) {
            query.dismissed = { $ne: true };
            const fortyEightHoursAgo = new Date(
                Date.now() - 48 * 60 * 60 * 1000,
            );
            query.createdAt = { $gte: fortyEightHoursAgo };
        }

        const requests = await RequestProgress.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await RequestProgress.countDocuments(query);

        return NextResponse.json({
            requests,
            hasMore: total > page * limit,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const user = await getCurrentUser();
        const { requestId } = await request.json();
        await RequestProgress.findOneAndUpdate(
            { requestId, owner: user._id },
            { dismissed: true },
        );
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const user = await getCurrentUser();
        const { requestId } = await request.json();
        await RequestProgress.findOneAndDelete({ requestId, owner: user._id });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
