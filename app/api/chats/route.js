import { NextResponse } from "next/server";
import { handleError } from "../utils/auth";
import {
    getChatsOfCurrentUser,
    createNewChat,
    searchChatTitles,
    searchChatContent,
} from "./_lib";
import { DEFAULT_PAGE_SIZE } from "../../constants/chats";

// Handle GET request to fetch saved messages of the current user
export async function GET(req) {
    try {
        const start = performance.now();
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get("page")) || 1;
        const limit = DEFAULT_PAGE_SIZE; // Number of chats per page
        const search = searchParams.get("search");
        const content = searchParams.get("content");
        const searchLimit = parseInt(searchParams.get("limit")) || undefined;

        if (search) {
            const chats = await searchChatTitles(
                search,
                searchLimit ? { limit: searchLimit } : undefined,
            );
            const response = NextResponse.json(chats);
            response.headers.set(
                "Server-Timing",
                `chatSearchTitle;dur=${(performance.now() - start).toFixed(1)}`,
            );
            return response;
        }
        if (content) {
            const chats = await searchChatContent(
                content,
                searchLimit ? { limit: searchLimit } : undefined,
            );
            const response = NextResponse.json(chats);
            response.headers.set(
                "Server-Timing",
                `chatSearchContent;dur=${(performance.now() - start).toFixed(1)}`,
            );
            return response;
        }

        const chats = await getChatsOfCurrentUser(page, limit);
        const response = NextResponse.json(chats);
        response.headers.set(
            "Server-Timing",
            `chatList;dur=${(performance.now() - start).toFixed(1)}`,
        );
        return response;
    } catch (error) {
        return handleError(error);
    }
}

export async function POST(req) {
    try {
        const start = performance.now();
        const { searchParams } = new URL(req.url);
        const isPrefetch = searchParams.get("prefetch") === "true";
        const forceNew = isPrefetch || searchParams.get("forceNew") === "true";

        let data;
        try {
            data = await req.json();
        } catch (e) {
            // If it's a prefetch request, we might not have a body
            if (isPrefetch) {
                data = {};
            } else {
                return Response.json(
                    { error: "Invalid or missing JSON body" },
                    { status: 400 },
                );
            }
        }
        const newChat = await createNewChat(data, {
            setActive: !isPrefetch,
            forceNew,
        });
        const response = NextResponse.json(newChat);
        response.headers.set(
            "Server-Timing",
            `chatCreate;dur=${(performance.now() - start).toFixed(1)}`,
        );
        return response;
    } catch (error) {
        return handleError(error); // Handle errors appropriately
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
