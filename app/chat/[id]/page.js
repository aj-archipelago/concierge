import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import Chat from "../../../src/components/chat/Chat";
import {
    getActiveChatId,
    getChatById,
    setActiveChatId,
} from "../../api/chats/_lib";

export default async function ChatPage({ params }) {
    let id = String(params.id);
    //also check id if valid mongo object id
    if (!id || id === "undefined" || id === "null") {
        console.warn("Chat ID is required");
        id = await getActiveChatId();
        // route page to active chat
    }
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
