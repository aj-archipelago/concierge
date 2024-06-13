import {
    ChatBubbleLeftIcon,
    CodeBracketIcon,
    GlobeAltIcon,
    MicrophoneIcon,
    PencilSquareIcon,
    PhotoIcon,
    TrashIcon,
    PlusIcon, // Importing PlusIcon for new chat
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineWorkspaces } from "react-icons/md";
import classNames from "../../app/utils/class-names";
import config from "../../config";
import { LanguageContext } from "../contexts/LanguageProvider";
import {
    useAddChat,
    useDeleteChat,
    useGetActiveChatId,
    useGetChats,
    useSetActiveChatId,
} from "../../app/queries/chats";
import { useQueryClient } from "@tanstack/react-query";

const navigation = [
    {
        name: "Chat",
        icon: ChatBubbleLeftIcon,
        href: "/chat",
        children: [
            {
                name: "...",
                href: "/chat/history",
                customClass: "pl-12", // Add Tailwind CSS class here
            },
        ], // To be dynamically filled
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

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { getLogo, getSidebarLogo } = config.global;
    const { language } = useContext(LanguageContext);
    const { t } = useTranslation();
    const { data: chatsData = [] } = useGetChats(); // Ensure chats default to an empty array
    const chats = chatsData || [];
    const deleteChat = useDeleteChat();
    const setActiveChatId = useSetActiveChatId();
    const getActiveChatId = useGetActiveChatId();
    const activeChatId = getActiveChatId?.data || getActiveChatId;
    const addChat = useAddChat();
    const queryClient = useQueryClient();

    const handleDeleteChat = (chatId) => {
        console.log(`Deleting chat: ${chatId}`);
        // Get the current active chat ID
        const currentActiveChatId = activeChatId;
        deleteChat.mutate({ chatId });

        // Only navigate if the deleted chat was the active chat
        if (chatId === currentActiveChatId) {
            //setActiveChatId.mutate(null);
            //set top chat as active chat if not create new chat
            const topChat = chats.filter((chat) => chat._id !== chatId)[0];
            if (topChat) {
                console.log("Setting top chat as active chat", topChat._id);
                setActiveChatId.mutate(topChat._id);
                router.push(`/chat/${topChat._id}`);
            } else {
                createDefaultNewChat();
            }
        }
    };

    const handleNewChat = async () => {
        if (chats.length > 0 && chats[0].messages.length === 0) {
            console.log("Active chat is empty, not creating new chat");
            router.push(`/chat/${chats[0]._id}`);
            return;
        }
        // console.log("Creating new chat");
        createDefaultNewChat();
    };

    const createDefaultNewChat = async () => {
        const newChat = await addChat.mutateAsync({ messages: [] });
        if (newChat && newChat._id) {
            const newChatId = newChat._id;
            // console.log("Setting active chat ID to:", newChatId);
            setActiveChatId.mutate(newChatId);
            router.push(`/chat/${newChatId}`);
            //invalidate chats
            queryClient.invalidateQueries("chats");
        }
    };

    const updatedNavigation = navigation.map((item) => {
        if (item.name === "Chat" && Array.isArray(chats)) {
            const items = chats.slice(0, 4);
            //active chat should always be included
            const activeChat = chats.find((chat) => chat._id === activeChatId);
            const itemsHasActiveChat = items.some(
                (chat) => chat._id === activeChatId,
            );
            if (!itemsHasActiveChat && activeChat) {
                items.pop();
                items.push(activeChat);
            }

            return {
                ...item,
                children: [
                    ...items.map((chat) => ({
                        name: (chat?.title && chat.title !== "New Chat"
                            ? chat.title
                            : (chat.messages && chat.messages[0]?.payload) ||
                              "New Chat"
                        ).slice(0, 21),
                        href: `/chat/${chat._id}`,
                        key: chat._id, // Unique key for each child
                    })),
                    ...(item.children || []), // Existing children
                ],
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
                    <li>
                        <ul className="-mx-2 space-y-1">
                            {updatedNavigation.map((item) => {
                                if (
                                    !item.children ||
                                    item.children.length === 0
                                ) {
                                    return (
                                        <li key={item.name}>
                                            <Link
                                                href={item.href || "#"}
                                                className={classNames(
                                                    pathname.includes(item.href)
                                                        ? "bg-gray-100"
                                                        : "hover:bg-gray-100",
                                                    "group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold text-gray-700",
                                                )}
                                            >
                                                <item.icon
                                                    className="h-6 w-6 shrink-0 text-gray-400"
                                                    aria-hidden="true"
                                                />
                                                {t(item.name)}
                                            </Link>
                                        </li>
                                    );
                                } else {
                                    return (
                                        <li
                                            key={item.name}
                                            className="cursor-pointer"
                                        >
                                            <div className="flex items-center justify-between">
                                                <button
                                                    className={classNames(
                                                        pathname.includes(
                                                            item.href,
                                                        )
                                                            ? "bg-gray-100"
                                                            : "hover:bg-gray-100",
                                                        "flex items-center w-full text-start rounded-md p-2 gap-x-3 text-sm leading-6 font-semibold text-gray-700",
                                                    )}
                                                    onClick={(e) => {
                                                        if (
                                                            item.name === "Chat"
                                                        ) {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                        } else {
                                                            router.push(
                                                                item.href,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <item.icon
                                                        className="h-6 w-6 shrink-0 text-gray-400"
                                                        aria-hidden="true"
                                                    />
                                                    {t(item.name)}

                                                    {item.name === "Chat" && (
                                                        <PlusIcon
                                                            className="h-6 w-6 ml-auto p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-800 cursor-pointer"
                                                            onClick={
                                                                handleNewChat
                                                            }
                                                        />
                                                    )}
                                                </button>
                                            </div>
                                            <ul className="mt-1 px-2">
                                                {item.children?.map(
                                                    (subItem) => (
                                                        <li
                                                            key={
                                                                subItem.key ||
                                                                JSON.stringify(
                                                                    subItem,
                                                                )
                                                            }
                                                            className={classNames(
                                                                pathname.includes(
                                                                    subItem.href,
                                                                ) ||
                                                                    (pathname ===
                                                                        "/chat" &&
                                                                        subItem.key ===
                                                                            activeChatId)
                                                                    ? //  ||
                                                                      //     subItem.key ===
                                                                      //         activeChatId.data
                                                                      "bg-gray-100"
                                                                    : "hover:bg-gray-100",
                                                                "group flex items-center justify-between rounded-md cursor-pointer",
                                                            )}
                                                            onClick={() => {
                                                                if (
                                                                    subItem.name !==
                                                                    "..."
                                                                ) {
                                                                    setActiveChatId.mutate(
                                                                        subItem.key,
                                                                    );
                                                                }
                                                                router.push(
                                                                    subItem.href,
                                                                );
                                                            }}
                                                        >
                                                            <div
                                                                className={`block py-2 pe-2 ${item.name === "Chat" ? "text-xs pl-4" : "text-sm pl-9"} leading-6 text-gray-700 w-full select-none`}
                                                            >
                                                                {t(
                                                                    subItem.name,
                                                                )}
                                                            </div>
                                                            {item.name ===
                                                                "Chat" &&
                                                                subItem.name !==
                                                                    "..." && (
                                                                    <TrashIcon
                                                                        className="h-4 w-4 mr-2 text-gray-400 hover:text-red-600 cursor-pointer"
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
                                        </li>
                                    );
                                }
                            })}
                        </ul>
                    </li>
                </ul>
            </nav>
        </div>
    );
}
