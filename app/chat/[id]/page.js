import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { redirect } from "next/navigation";
import Chat from "../../../src/components/chat/Chat";
import { getActiveChatId, getChatById } from "../../api/chats/_lib";
import { isClientOnlyChatId } from "../../utils/chatClientIds";

const DEFAULT_CHAT_MESSAGES_LIMIT = 30;

export default async function ChatPage({ params, searchParams }) {
    params = await params;
    searchParams = await searchParams;
    let id = String(params.id);
    //also check id if valid mongo object id
    if (!id || id === "undefined" || id === "null") {
        console.warn("Chat ID is required");
        id = await getActiveChatId();
        // route page to active chat
    }

    const forceClient = searchParams?.client === "1";

    // INSTANT: /chat/new should never SSR because the stream promotes it
    // into a persisted chat ID on the client.
    if (forceClient || isClientOnlyChatId(id)) {
        return (
            <div className="flex flex-col h-full">
                <Chat viewingChat={null} />
            </div>
        );
    }
    let chat;
    try {
        chat = await getChatById(id, {
            limit: DEFAULT_CHAT_MESSAGES_LIMIT,
        });
    } catch (error) {
        // Handle unauthorized access (e.g., user switched accounts)
        if (error.message === "Unauthorized access") {
            // Try to get the user's active chat instead
            const activeChatId = await getActiveChatId();
            if (activeChatId && activeChatId !== id) {
                // Redirect to active chat if available
                redirect(`/chat/${activeChatId}`);
            }
            // If no active chat, redirect to chat list
            redirect("/chat");
        }
        // Re-throw other errors
        throw error;
    }

    if (!chat) {
        const activeChatId = await getActiveChatId();
        if (activeChatId && activeChatId !== id) {
            redirect(`/chat/${activeChatId}`);
        }
        redirect("/chat");
    }
    const { readOnly } = chat || {};

    const queryClient = new QueryClient();

    let viewingChat = null;
    if (chat) {
        viewingChat = JSON.parse(JSON.stringify(chat));
        if (!readOnly) {
            viewingChat = null;
            // Note: Active chat ID will be updated asynchronously by Chat.js component
            // No need to update it here during navigation
        }
    }

    // Prefetch the chat data with a short staleTime to allow refetching
    // This ensures we get fresh data if server persisted messages while user was away
    if (chat) {
        await queryClient.prefetchQuery({
            queryKey: ["chat", id],
            queryFn: async () => {
                return JSON.parse(JSON.stringify(chat));
            },
            staleTime: 0, // Always refetch on navigation to get latest server state
        });
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="flex flex-col h-full">
                <Chat viewingChat={viewingChat} />
            </div>
        </HydrationBoundary>
    );
}
