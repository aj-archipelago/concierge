import { redirect } from "next/navigation";
import { createNewChat } from "../../api/chats/_lib";

export const dynamic = "force-dynamic";

export default async function NewChatPage() {
    const chat = await createNewChat({ messages: [], title: "" });

    redirect(`/chat/${String(chat._id)}`);
}
