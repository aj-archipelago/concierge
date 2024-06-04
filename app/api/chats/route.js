import User from "../models/user";
import { getCurrentUser, handleError } from "../utils/auth";

// Handle GET request to fetch saved messages of the current user
export async function GET(req) {
    try {
        const user = await getCurrentUser(false);
        const savedChats = user.savedChats;
        return Response.json({ status: "success", savedChats });
    } catch (error) {
        return handleError(error);
    }
}

export async function POST(req) {
    try {
        const { messageList, title } = await req.json();
        const currentUser = await getCurrentUser(false);

        const user = await User.findByIdAndUpdate(
            currentUser._id,
            {
                $push: {
                    savedChats: {
                        $each: [{ messages: messageList, title }], // Wrapping in an object to match the schema
                        $position: 0, // Push to the top
                    },
                },
            },
            { new: true, useFindAndModify: false }, // Correct options for findByIdAndUpdate
        );

        if (!user) throw new Error("User not found");

        return Response.json({ status: "success", user });
    } catch (error) {
        return handleError(error); // Handle errors appropriately
    }
}

// Handle PUT request to edit existing saved messages for the current user
export async function PUT(req) {
    try {
        const { messageId, newMessageContent } = await req.json();
        const currentUser = await getCurrentUser(false);

        const user = await User.findOneAndUpdate(
            { _id: currentUser._id, "savedChats._id": messageId },
            {
                $set: {
                    "savedChats.$.content": newMessageContent,
                },
            },
            { new: true, useFindAndModify: false },
        );

        if (!user) throw new Error("User or message not found");

        return Response.json({ status: "success", user });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
