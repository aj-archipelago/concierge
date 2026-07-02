import {
    openCanvas,
    setActiveCanvasChat,
    setCanvasVisibility,
} from "@/src/stores/chatSlice";

export function toArticleIdString(value) {
    if (!value) return null;
    if (typeof value === "object" && value._id) return String(value._id);
    return String(value);
}

export async function openCanvasArticleInChat({
    articleId,
    addChat,
    dispatch,
    router,
    t = (key) => key,
}) {
    const id = toArticleIdString(articleId);
    if (!id) {
        throw new Error("Missing article id");
    }

    const articleRes = await fetch(`/api/articles/${id}`);
    if (!articleRes.ok) {
        const error = new Error(
            `Failed to fetch article: ${articleRes.status}`,
        );
        error.status = articleRes.status;
        throw error;
    }

    const article = await articleRes.json();
    const title = article.title || t("Untitled article");

    const chat = await addChat.mutateAsync({
        messages: [],
        title,
        forceNew: true,
        isUnused: false,
    });
    const chatId = toArticleIdString(chat?._id);
    if (!chatId) {
        throw new Error("Chat creation returned no id");
    }

    dispatch(setActiveCanvasChat(chatId));
    dispatch(
        openCanvas({
            type: "article",
            title,
            workspacePath: article.workspacePath,
            fileHash: article.fileHash || null,
            blobPath: article.blobPath || null,
            filename: article.filename || null,
            articleId: id,
            readOnly: Boolean(article.readOnly),
            owner: article.owner || null,
        }),
    );
    dispatch(setCanvasVisibility(true));

    router.push(`/chat/${chatId}`);
    return { chatId, article };
}
