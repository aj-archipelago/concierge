import { NextResponse } from "next/server";
import User from "../../models/user";
import { getCurrentUser, handleError } from "../../utils/auth";

// Handle GET request to retrieve the active chat ID for the current user
export async function GET(req) {
    try {
        const currentUser = await getCurrentUser(false);
        return NextResponse.json(currentUser.activeChatId);
    } catch (error) {
        return handleError(error);
    }
}

// Handle PUT request to set activeChatId for the current user
export async function PUT(req) {
    try {
        const { activeChatId } = await req.json();
        // console.log("PUT activeChatId", activeChatId);
        if (!activeChatId) throw new Error("activeChatId is required");

        const currentUser = await getCurrentUser(false);

        const updatedUser = await User.findByIdAndUpdate(
            currentUser._id,
            {
                $set: { activeChatId },
            },
            { new: true, useFindAndModify: false },
        );

        if (!updatedUser) throw new Error("User not found");

        return NextResponse.json(updatedUser.activeChatId);
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
