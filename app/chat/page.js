import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import Chat from "../../src/components/chat/Chat";
import { setActiveChatId } from "./../api/chats/active/route";
import { createNewChat } from "../api/chats/route";

export default async function ChatPage() {
    // Create a new chat
    const newChat = await createNewChat({});
    const id = await setActiveChatId(String(newChat._id));
    console.log(newChat, id);

    const queryClient = new QueryClient();

    // Prefetch the chat data
    await queryClient.prefetchQuery({
        queryKey: ["chat", id],
        queryFn: async () => {
            return newChat.toJSON();
        },
        staleTime: Infinity,
    });

    //Prefetch the active chat id with the provided id
    await queryClient.prefetchQuery({
        queryKey: ["activeChatId"],
        queryFn: async () => {
            return String(id);
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
