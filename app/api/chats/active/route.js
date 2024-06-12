import { NextResponse } from "next/server";
import User from "../../models/user";
import { getCurrentUser, handleError } from "../../utils/auth";

// Function to get active chat ID for the current user
export async function getActiveChatId() {
    const currentUser = await getCurrentUser(false);
    return String(currentUser.activeChatId);
}

// Function to set active chat ID for the current user
export async function setActiveChatId(activeChatId) {
    if (!activeChatId) throw new Error("activeChatId is required");

    const currentUser = await getCurrentUser(false);

    const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        {
            $set: { activeChatId: String(activeChatId) },
        },
        { new: true, useFindAndModify: false },
    );

    if (!updatedUser) throw new Error("User not found");

    return String(updatedUser.activeChatId);
}

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
