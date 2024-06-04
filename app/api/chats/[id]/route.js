import { NextResponse } from "next/server";
import User from "../../models/user";
import { getCurrentUser, handleError } from "../../utils/auth";

// Handle DELETE request to delete a chat for the current user
export async function DELETE(req, { params }) {
    try {
        const { id } = params;
        if (!id) {
            throw new Error("Chat ID is required");
        }

        const currentUser = await getCurrentUser(false);

        const user = await User.findByIdAndUpdate(
            currentUser._id,
            {
                $pull: { savedChats: { _id: id } },
            },
            { new: true, useFindAndModify: false },
        );

        if (!user) {
            throw new Error("User or chat not found");
        }

        return NextResponse.json({ status: "success", user });
    } catch (error) {
        return handleError(error);
    }
}
