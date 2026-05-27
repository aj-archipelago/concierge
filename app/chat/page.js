import { headers } from "next/headers";
import SavedChats from "../../src/components/chat/SavedChats";
import { getChatsOfCurrentUser } from "../api/chats/_lib";

const CHAT_LIST_PAGE_SIZE = 30;

export default async function ChatHistoryPage() {
    let initialChats = null;
    const headerList = headers();
    const skipSSR = headerList.get("x-skip-ssr-chats") === "true";

    if (!skipSSR) {
        try {
            const chats = await getChatsOfCurrentUser(1, CHAT_LIST_PAGE_SIZE);
            initialChats = chats ? JSON.parse(JSON.stringify(chats)) : chats;
        } catch (error) {
            console.error("Failed to prefetch chats:", error);
            initialChats = null;
        }
    }

    return (
        <div>
            <SavedChats initialChats={initialChats} />
        </div>
    );
}
