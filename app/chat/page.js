import axios from "axios";
import { redirect } from "next/navigation"; // Import the redirect function
import { serverUrl } from "../../src/utils/constants";

export default async function ChatPage() {
    const url = `${serverUrl}/api/chats`;

    // Create a new chat
    const response = await axios.post(url, {
        messages: [],
        title: "New Chat",
    });
    const newChat = response.data;

    if (newChat?._id) {
        // Redirect to the new chat page
        redirect(`/chat/${newChat._id}`);
    } else {
        throw new Error("Failed to create a new chat");
    }
}
