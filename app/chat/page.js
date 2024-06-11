import axios from "axios";
import { serverUrl } from "../../src/utils/constants";
import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import Chat from "../../src/components/chat/Chat";

export default async function ChatPage() {
    const chatsUrl = `${serverUrl}/api/chats`;
    const activeChatUrl = `${serverUrl}/api/chats/active`;

    // Create a new chat
    const response = await axios.post(chatsUrl, {
        messages: [],
    });
    const newChat = response.data;
    const id = String(newChat._id);
    await axios.put(activeChatUrl, { activeChatId: id });

    const queryClient = new QueryClient();

    // Prefetch the chat data
    await queryClient.prefetchQuery({
        queryKey: ["chat", id],
        queryFn: async () => {
            return newChat;
        },
        staleTime: Infinity,
    });

    //Prefetch the active chat id with the provided id
    await queryClient.prefetchQuery({
        queryKey: ["activeChatId"],
        queryFn: async () => {
            return id;
        },
        staleTime: Infinity,
    });

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="flex flex-col h-full">
                <Chat />
            </div>
        </HydrationBoundary>
    );
}
