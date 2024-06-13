import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import Chat from "../../../src/components/chat/Chat";
import { getChatById, setActiveChatId } from "../../api/chats/_lib";

export default async function ChatPage({ params }) {
    const id = String(params.id);
    const response = await getChatById(id);
    await setActiveChatId(id);
    const queryClient = new QueryClient();

    // Prefetch the chat data
    await queryClient.prefetchQuery({
        queryKey: ["chat", id],
        queryFn: async () => {
            return JSON.parse(JSON.stringify(response));
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
