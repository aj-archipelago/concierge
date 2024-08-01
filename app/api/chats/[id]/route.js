import { NextResponse } from "next/server";
import Chat from "../../models/chat";
import { getCurrentUser, handleError } from "../../utils/auth";
import { deleteChatIdFromRecentList, getChatById } from "../_lib";

// Handle POST request to add a message to an existing chat for the current user
export async function POST(req, { params }) {
    try {
        const { id } = params;
        if (!id) {
            throw new Error("Chat ID is required");
        }

        const currentUser = await getCurrentUser(false);
        const { message } = await req.json();

        const chat = await Chat.findOne({ _id: id, userId: currentUser._id });
        if (chat) {
          chat.messages = [...chat.messages, message];
          await chat.save();
        }

        if (!chat) {
            throw new Error("Chat not found");
        }

        return NextResponse.json(chat);
    } catch (error) {
        return handleError(error);
    }
}

// Handle DELETE request to delete a chat for the current user
export async function DELETE(req, { params }) {
    try {
        const { id } = params;
        if (!id) {
            throw new Error("Chat ID is required");
        }

        const currentUser = await getCurrentUser(false);

        const chat = await Chat.findOneAndDelete({
            _id: id,
            userId: currentUser._id,
        });

        if (!chat) {
            throw new Error("Chat not found");
        }

        const response = await deleteChatIdFromRecentList(id);

        return NextResponse.json({ ...response, deletedChat: chat });
    } catch (error) {
        return handleError(error);
    }
}

// Handle GET request to retrieve a chat for the current user
export async function GET(req, { params }) {
    try {
        const { id } = params;
        const chat = await getChatById(id);
        return NextResponse.json(chat);
    } catch (error) {
        return handleError(error);
    }
}

// Handle PUT request to update a chat for the current user
export async function PUT(req, { params }) {
    try {
        const { id } = params;
        if (!id) {
            throw new Error("Chat ID is required");
        }

        const currentUser = await getCurrentUser(false);
        const body = await req.json();

        const chat = await Chat.findOneAndUpdate(
            {
                _id: id,
                userId: currentUser._id,
            },
            body,
            { new: true },
        );

        if (!chat) {
            throw new Error("Chat not found");
        }

        return NextResponse.json(chat);
    } catch (error) {
        return handleError(error);
    }
}
