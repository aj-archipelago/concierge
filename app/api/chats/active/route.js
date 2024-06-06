import User from "../../models/user";
import { getCurrentUser, handleError } from "../../utils/auth";

// Handle GET request to retrieve the active chat ID for the current user
export async function GET(req) {
    try {
        const currentUser = await getCurrentUser(false);

        if (!currentUser.activeChatId) {
            // No active chat ID, return default
            return new Response(
                JSON.stringify({ status: "success", activeChatId: null }),
                {
                    headers: { "Content-Type": "application/json" },
                },
            );
        }

        return new Response(
            JSON.stringify({
                status: "success",
                activeChatId: currentUser.activeChatId,
            }),
            {
                headers: { "Content-Type": "application/json" },
            },
        );
    } catch (error) {
        return handleError(error);
    }
}

// Handle PUT request to set activeChatId for the current user
export async function PUT(req) {
    try {
        const { activeChatId } = await req.json();
        const currentUser = await getCurrentUser(false);

        const updatedUser = await User.findByIdAndUpdate(
            currentUser._id,
            {
                $set: { activeChatId },
            },
            { new: true, useFindAndModify: false },
        );

        if (!updatedUser) throw new Error("User not found");

        return new Response(
            JSON.stringify({ status: "success", user: updatedUser }),
            {
                headers: { "Content-Type": "application/json" },
            },
        );
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
