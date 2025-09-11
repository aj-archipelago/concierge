import { NextResponse } from "next/server";
import { handleError } from "../utils/auth";
import { getChatsOfCurrentUser, createNewChat, updateChat, searchChatTitles } from "./_lib";
import { DEFAULT_PAGE_SIZE } from "../../queries/chats";

// Handle GET request to fetch saved messages of the current user
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get("page")) || 1;
        const limit = DEFAULT_PAGE_SIZE; // Number of chats per page
        const search = searchParams.get("search");
        
        if (search) {
            const chats = await searchChatTitles(search);
            return NextResponse.json(chats);
        }
        
        const chats = await getChatsOfCurrentUser(page, limit);
        return NextResponse.json(chats);
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
        return NextResponse.json(updatedChat);
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
