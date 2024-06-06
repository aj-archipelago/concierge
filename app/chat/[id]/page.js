import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import Chat from "../../../src/components/chat/Chat";
import { serverUrl } from "../../../src/utils/constants";

async function getChatById(chatId) {
    const response = await axios.get(`/api/chats/${chatId}`);
    return response.data;
}

export default async function ChatPage({ params }) {
    const id = params.id;
    const url = `${serverUrl}/api/chats/active`;

    // Set user's activeChatId to the provided id
    await axios.put(url, { activeChatId: id });

    const queryClient = new QueryClient();

    // Prefetch the chat data
    await queryClient.prefetchQuery({
        queryKey: ["chat", id],
        queryFn: async () => {
            const response = await getChatById(id);
            return response.toJSON();
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
