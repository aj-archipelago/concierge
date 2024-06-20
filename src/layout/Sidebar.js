import {
    ChatBubbleLeftIcon,
    CodeBracketIcon,
    GlobeAltIcon,
    MicrophoneIcon,
    PencilSquareIcon,
    PhotoIcon,
    TrashIcon,
    PlusIcon,
} from "@heroicons/react/24/outline";
import { FaEdit } from "react-icons/fa"; // Import edit icon
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineWorkspaces } from "react-icons/md";
import classNames from "../../app/utils/class-names";
import config from "../../config";
import { LanguageContext } from "../contexts/LanguageProvider";
import {
    useAddChat,
    useDeleteChat,
    useGetActiveChatId,
    useGetActiveChats,
    useSetActiveChatId,
    useUpdateChat,
} from "../../app/queries/chats";
import { useQueryClient } from "@tanstack/react-query";
import { HelpCircle } from "lucide-react";
import SendFeedbackModal from "../components/help/SendFeedbackModal";

const navigation = [
    {
        name: "Chat",
        icon: ChatBubbleLeftIcon,
        href: "/chat",
        children: [],
    },
    {
        name: "Translate",
        icon: GlobeAltIcon,
        href: "/translate",
    },
    {
        name: "Transcribe",
        icon: MicrophoneIcon,
        href: "/transcribe",
    },
    {
        name: "Write",
        icon: PencilSquareIcon,
        href: "/write",
    },
    {
        name: "Workspaces",
        icon: MdOutlineWorkspaces,
        href: "/workspaces",
    },
    {
        name: "Images",
        icon: PhotoIcon,
        href: "/images",
    },
    {
        name: "Code",
        icon: CodeBracketIcon,
        children: [
            {
                name: "Knuth",
                href: "/code/knuth",
            },
            {
                name: "JIRA",
                href: "/code/jira",
            },
        ],
    },
];

export default React.forwardRef(function Sidebar(_, ref) {
    const pathname = usePathname();
    const router = useRouter();
    const { getLogo, getSidebarLogo } = config.global;
    const { language } = useContext(LanguageContext);
    const { t } = useTranslation();
    const { data: chatsData = [] } = useGetActiveChats();
    const chats = chatsData || [];
    const deleteChat = useDeleteChat();
    const setActiveChatId = useSetActiveChatId();
    const getActiveChatId = useGetActiveChatId();
    const activeChatId = getActiveChatId?.data || getActiveChatId;
    const addChat = useAddChat();
    const queryClient = useQueryClient();
    const updateChat = useUpdateChat();

    const [editingId, setEditingId] = useState(null);
    const [editedName, setEditedName] = useState("");

    const handleDeleteChat = (chatId) => {
        if (!window.confirm("Are you sure you want to delete this chat?")) {
            return;
        }

        const currentActiveChatId = activeChatId;
        deleteChat.mutate({ chatId });

        if (chatId === currentActiveChatId) {
            const topChat = chats.filter((chat) => chat._id !== chatId)[0];
            if (topChat) {
                setActiveChatId.mutate(topChat._id);
                router.push(`/chat/${topChat._id}`);
            } else {
                createDefaultNewChat();
            }
        }
    };

    const handleNewChat = async () => {
        // console.log("Creating new chat");
        // if (chats.length > 0 && chats[0].messages.length === 0) {
        //     router.push(`/chat/${chats[0]._id}`);
        //     return;
        // }
        createDefaultNewChat();
    };

    const createDefaultNewChat = async () => {
        const newChatIndex = chats.findIndex(
            (chat) => chat.messages.length === 0,
        );
        if (newChatIndex > -1) {
            setActiveChatId.mutate(chats[newChatIndex]._id);
            router.push(`/chat/${chats[newChatIndex]._id}`);
            return;
        }
        const newChat = await addChat.mutateAsync({ messages: [] });
        if (newChat && newChat._id) {
            const newChatId = newChat._id;
            setActiveChatId.mutate(newChatId);
            router.push(`/chat/${newChatId}`);
            queryClient.invalidateQueries("chats");
            queryClient.invalidateQueries("activeChats");
        }
    };

    const handleSaveEdit = (item) => {
        updateChat.mutate({
            chatId: item.key,
            title: editedName,
            titleSetByUser: true,
        });
        setEditingId(null);
    };

    const updatedNavigation = navigation.map((item) => {
        if (item.name === "Chat" && Array.isArray(chats)) {
            const items = chats.slice(0, 3);

            return {
                ...item,
                children: items.map((chat) => ({
                    name: (chat?.title && chat.title !== "New Chat"
                        ? chat.title
                        : (chat?.messages && chat?.messages[0]?.payload) ||
                          "New Chat"
                    ).slice(0, 21),
                    href: chat._id ? `/chat/${chat._id}` : ``,
                    key: chat._id,
                })),
            };
        }
        return item;
    });

    return (
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-5">
            <div className="flex h-16 shrink-0 items-center gap-2">
                <Link className="flex items-center gap-2" href="/">
                    <img
                        className="h-12 w-auto"
                        src={getLogo(language)}
                        alt="Your Company"
                    />
                    {getSidebarLogo(language)}
                </Link>
            </div>
            <nav className="flex flex-1 flex-col">
                <ul className="flex flex-1 flex-col gap-y-7">
                    <li className="grow">
                        <ul className="-mx-2 space-y-1">
                            {updatedNavigation.map((item) => (
                                <li
                                    key={item.name}
                                    className="rounded-md cursor-pointer"
                                >
                                    <div
                                        className={classNames(
                                            "flex items-center justify-between",
                                            item.href &&
                                                pathname.includes(item.href) &&
                                                pathname === item.href
                                                ? "bg-gray-100"
                                                : "hover:bg-gray-100",
                                            "rounded-md p-2 text-sm leading-6 font-semibold text-gray-700",
                                        )}
                                        onClick={() => {
                                            if (item.href) {
                                                router.push(item.href);
                                            }
                                        }}
                                    >
                                        <div className="flex items-center grow gap-x-3">
                                            <item.icon
                                                className="h-6 w-6 shrink-0 text-gray-400"
                                                aria-hidden="true"
                                            />
                                            {t(item.name)}
                                        </div>
                                        {item.name === "Chat" && (
                                            <PlusIcon
                                                className="h-6 w-6 ml-auto p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-800 cursor-pointer"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleNewChat();
                                                }}
                                            />
                                        )}
                                    </div>
                                    {item.children?.length > 0 && (
                                        <ul className="mt-1 px-1">
                                            {item.children.map(
                                                (subItem, index) => (
                                                    <li
                                                        key={
                                                            subItem.key ||
                                                            JSON.stringify(
                                                                subItem,
                                                            )
                                                        }
                                                        className={classNames(
                                                            "group flex items-center justify-between rounded-md cursor-pointer hover:bg-gray-100 my-0.5",
                                                            // (index === 0 &&
                                                            //     item.name ===
                                                            //         "Chat" &&
                                                            //     pathname.startsWith(
                                                            //         "/chat/",
                                                            //     )) ||
                                                            pathname ===
                                                                subItem?.href
                                                                ? "bg-gray-100"
                                                                : "",
                                                        )}
                                                    >
                                                        <div
                                                            className={`relative block py-2.5 pe-1 ${item.name === "Chat" ? "text-xs pl-4" : "text-sm pl-9"} leading-6 text-gray-700 w-full select-none`}
                                                            onClick={() => {
                                                                // make its hover effect gone
                                                                document.activeElement.blur();

                                                                if (
                                                                    subItem.href
                                                                ) {
                                                                    setActiveChatId.mutate(
                                                                        subItem.key,
                                                                    );
                                                                    router.push(
                                                                        subItem.href,
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            {item.name ===
                                                                "Chat" &&
                                                            editingId &&
                                                            editingId ===
                                                                subItem.key ? (
                                                                <input
                                                                    autoFocus
                                                                    type="text"
                                                                    className="border-0 ring-1 w-full text-xs bg-gray-50 p-0 font-medium"
                                                                    value={
                                                                        editedName
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) => {
                                                                        setEditedName(
                                                                            e
                                                                                .target
                                                                                .value,
                                                                        );
                                                                    }}
                                                                    onKeyDown={(
                                                                        e,
                                                                    ) => {
                                                                        if (
                                                                            e.key ===
                                                                            "Enter"
                                                                        ) {
                                                                            handleSaveEdit(
                                                                                subItem,
                                                                            );
                                                                        }
                                                                        if (
                                                                            e.key ===
                                                                            "Escape"
                                                                        ) {
                                                                            setEditingId(
                                                                                null,
                                                                            );
                                                                        }
                                                                    }}
                                                                />
                                                            ) : (
                                                                <>
                                                                    {item.name ===
                                                                        "Chat" && (
                                                                        <FaEdit
                                                                            className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer invisible group-hover:visible"
                                                                            onClick={(
                                                                                e,
                                                                            ) => {
                                                                                e.stopPropagation();
                                                                                setEditingId(
                                                                                    subItem.key,
                                                                                );
                                                                                setEditedName(
                                                                                    subItem.name,
                                                                                );
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <span className="pl-3">
                                                                        {t(
                                                                            subItem.name,
                                                                        )}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                        {item.name ===
                                                            "Chat" && (
                                                            <TrashIcon
                                                                className="h-4 w-4 mr-1 text-gray-400 group-hover:visible invisible hover:text-red-600 cursor-pointer"
                                                                aria-hidden="true"
                                                                onClick={(
                                                                    e,
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteChat(
                                                                        subItem.key,
                                                                    );
                                                                }}
                                                            />
                                                        )}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </li>
                    <li>
                        <div className="py-3 bg-gray-50 -mx-5 px-5 text-gray-700">
                            <SendFeedbackButton ref={ref} />
                        </div>
                    </li>
                </ul>
            </nav>
        </div>
    );
});

const SendFeedbackButton = React.forwardRef(
    function SendFeedbackButton(_, ref) {
        const [show, setShow] = useState(false);
        const { t } = useTranslation();

        return (
            <>
                <SendFeedbackModal
                    ref={ref}
                    show={show}
                    onHide={() => setShow(false)}
                />
                <button
                    className="flex gap-2 items-center text-sm"
                    onClick={() => setShow(true)}
                >
                    <HelpCircle className="h-6 w-6 shrink-0 text-gray-400" />
                    {t("Send feedback")}
                </button>
            </>
        );
    },
);
