import { NextResponse } from "next/server";
import { handleError } from "../utils/auth";
import { getChatsOfCurrentUser, createNewChat, updateChat } from "./_lib";

// Handle GET request to fetch saved messages of the current user
export async function GET(req) {
    try {
        const chats = await getChatsOfCurrentUser();
        return NextResponse.json(chats); // Use NextResponse to return JSON
    } catch (error) {
        return handleError(error);
    }
}

export async function POST(req) {
    try {
        const data = await req.json();
        const newChat = await createNewChat(data);
        return NextResponse.json(newChat);
    } catch (error) {
        return handleError(error); // Handle errors appropriately
    }
}

// Handle PUT request to edit existing saved messages for the current user
export async function PUT(req) {
    try {
        const data = await req.json();
        const updatedChat = await updateChat(data);
        return Response.json(updatedChat);
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
