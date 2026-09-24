import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../utils/auth";
import User from "../../models/user";

export const dynamic = "force-dynamic";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 20;
const EMAIL_USERNAME = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

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

        const candidates = await User.find(
            {
                _id: { $ne: currentUser._id },
                username: EMAIL_USERNAME,
                $or: [{ name: rx }, { username: rx }],
            },
            {
                _id: 1,
                name: 1,
                username: 1,
                profilePicture: 1,
                lastActiveAt: 1,
                updatedAt: 1,
            },
        )
            .limit(MAX_RESULTS * 5)
            .lean();

        candidates.sort((a, b) => {
            const activityAt = (user) =>
                new Date(user.lastActiveAt || user.updatedAt || 0).getTime();
            return activityAt(b) - activityAt(a);
        });

        const currentUsername = currentUser.username?.trim().toLowerCase();
        const seenUsernames = new Set();
        const users = [];

        for (const candidate of candidates) {
            const username = candidate.username?.trim().toLowerCase();
            const identityKey = username || String(candidate._id);
            if (
                (currentUsername && username === currentUsername) ||
                seenUsernames.has(identityKey)
            ) {
                continue;
            }

            seenUsernames.add(identityKey);
            users.push({
                _id: candidate._id,
                name: candidate.name,
                username: candidate.username,
                profilePicture: candidate.profilePicture,
            });
            if (users.length >= MAX_RESULTS) {
                break;
            }
        }

        return NextResponse.json(users);
    } catch (error) {
        return handleError(error);
    }
}
