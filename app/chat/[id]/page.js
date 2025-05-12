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

    const chat = await getChatById(id);
    if (!chat) {
        return (
            <div className="flex items-center justify-center">
                <div className="text-center p-8 bg-white rounded-lg shadow-md">
                    <h1 className="text-2xl font-bold text-red-600 mb-2">
                        Chat not found!
                    </h1>
                    <p className="text-gray-600">
                        The requested chat does not exist or has been deleted.
                    </p>
                </div>
            </div>
        );
    }
    const { readOnly } = chat;

    const queryClient = new QueryClient();

    let viewingChat = JSON.parse(JSON.stringify(chat));
    if (!readOnly) {
        viewingChat = null;
        await setActiveChatId(id);

        //Prefetch the active chat id with the provided id
        await queryClient.prefetchQuery({
            queryKey: ["activeChatId"],
            queryFn: async () => {
                return id;
            },
            staleTime: Infinity,
        });
    }

    // Prefetch the chat data
    await queryClient.prefetchQuery({
        queryKey: ["chat", id],
        queryFn: async () => {
            return JSON.parse(JSON.stringify(chat));
        },
        staleTime: Infinity,
    });

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="flex flex-col h-full">
                <Chat viewingChat={viewingChat} />
            </div>
        </HydrationBoundary>
    );
}
