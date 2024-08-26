import { QUERIES } from "../../graphql";

const handleSaveChat = async (messages, client, addChat) => {
    if (Array.isArray(messages) && messages.length > 0) {
        try {
            const result = await client.query({
                query: QUERIES.HEADLINE,
                variables: {
                    text: JSON.stringify(
                        messages.filter(({ sender }) => sender === "user"),
                    ),
                    targetLength: 40,
                    count: 1,
                },
            });
            const title = result.data?.headline?.result[0];
            await addChat.mutateAsync({ messageList: messages, title });
        } catch (error) {
            console.error("Error fetching chat title:", error);
        }
    } else {
        console.error("No messages to save or messages is not an array");
    }
};

export { handleSaveChat };
