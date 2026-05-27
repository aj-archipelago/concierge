"use client";

import { useParams } from "next/navigation";
import Loader from "../../components/loader";
import { isClientOnlyChatId } from "../../utils/chatClientIds";

export default function ChatLoading() {
    const params = useParams();
    const chatId = params?.id;

    if (isClientOnlyChatId(chatId)) {
        return null;
    }

    return (
        <div className="flex items-center justify-center h-full">
            <Loader />
        </div>
    );
}
