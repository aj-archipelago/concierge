import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import User from "../../models/user";

export const dynamic = "force-dynamic";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 20;

function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req) {
    try {
        const currentUser = await getCurrentUser(false);
        if (!currentUser?._id || currentUser.userId === "anonymous") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { searchParams } = new URL(req.url);
        const raw = (searchParams.get("q") || "").trim();

        if (raw.length < MIN_QUERY_LENGTH) {
            return NextResponse.json([]);
        }
        const q = raw.slice(0, MAX_QUERY_LENGTH);
        const rx = new RegExp(escapeRegex(q), "i");

        const users = await User.find(
            {
                _id: { $ne: currentUser._id },
                $or: [{ name: rx }, { username: rx }],
            },
            { _id: 1, name: 1, username: 1, profilePicture: 1 },
        )
            .limit(MAX_RESULTS)
            .lean();

        return NextResponse.json(users);
    } catch (error) {
        return handleError(error);
    }
}
