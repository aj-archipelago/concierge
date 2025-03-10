import { EditIcon, TrashIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateChat } from "../../app/queries/chats";
import classNames from "../../app/utils/class-names";

const ChatNavigationItem = ({
    subItem,
    pathname,
    router,
    setActiveChatId,
    handleDeleteChat,
}) => {
    const [editingId, setEditingId] = useState(null);
    const [editedName, setEditedName] = useState("");
    const { t } = useTranslation();
    const updateChat = useUpdateChat();

    const handleSaveEdit = (item) => {
        updateChat.mutateAsync({
            chatId: item.key,
            title: editedName,
            titleSetByUser: true,
        });
        setEditingId(null);
    };

    return (
        <li
            className={classNames(
                "group flex items-center justify-between rounded-md cursor-pointer hover:bg-gray-100 my-0.5",
                pathname === subItem?.href ? "bg-gray-100" : "",
            )}
            onClick={() => {
                if (subItem.href && editingId !== subItem.key) {
                    setEditingId(null);
                    router.push(subItem.href);
                    setActiveChatId.mutateAsync(subItem.key).catch((error) => {
                        console.error("Error setting active chat ID:", error);
                    });
                }
            }}
        >
            <div
                className={`h-10 py-2.5 px-2 text-xs flex items-center justify-between gap-2 w-full`}
                dir={document.documentElement.dir}
            >
                <div className="flex items-center gap-2 overflow-auto">
                    {editingId && editingId === subItem.key ? (
                        <>
                            <div className="basis-3">
                                <XIcon
                                    className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-pointer invisible group-hover:visible"
                                    style={{
                                        left:
                                            document.documentElement.dir ===
                                            "rtl"
                                                ? "unset"
                                                : "0.5rem",
                                        right:
                                            document.documentElement.dir ===
                                            "rtl"
                                                ? "0.5rem"
                                                : "unset",
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(null);
                                        setEditedName(subItem.name);
                                    }}
                                />
                            </div>
                            <input
                                onBlur={() => {
                                    setEditingId(null);
                                    handleSaveEdit(subItem);
                                }}
                                autoFocus
                                type="text"
                                className="py-1 border-0 w-full text-xs bg-gray-50 p-0 font-medium underline ring-0 focus:ring-0 focus:outline-none"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                        handleSaveEdit(subItem);
                                    if (e.key === "Escape") setEditingId(null);
                                }}
                            />
                        </>
                    ) : (
                        <>
                            <div className="basis-3">
                                <EditIcon
                                    className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-pointer invisible group-hover:visible"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(subItem.key);
                                        setEditedName(subItem.name);
                                    }}
                                />
                            </div>
                            <div className="truncate">
                                {t(subItem.name || "")}
                            </div>
                        </>
                    )}
                </div>
                {editingId !== subItem.key && (
                    <div className="basis-3 text-end">
                        <TrashIcon
                            className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-pointer invisible group-hover:visible hover:text-red-600"
                            aria-hidden="true"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteChat(subItem.key);
                            }}
                        />
                    </div>
                )}
            </div>
        </li>
    );
};

export default ChatNavigationItem;
