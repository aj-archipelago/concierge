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
    useDeleteChat,
    useGetActiveChatId,
    useGetChats,
    useSetActiveChatId,
} from "../../app/queries/chats";

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
    const activeChatId = useGetActiveChatId();

    const handleDeleteChat = (chatId) => {
        console.log(`Deleting chat: ${chatId}`);
        // Get the current active chat ID
        const currentActiveChatId = activeChatId.data;

        deleteChat.mutate({ chatId });

        // Only navigate if the deleted chat was the active chat
        if (chatId === currentActiveChatId) {
            setActiveChatId.mutate(null);
            router.push("/chat");
        }
    };

    const handleNewChat = async () => {
        console.log("Creating new chat");
        await setActiveChatId.mutateAsync(null); // Wait for the mutation to complete
        router.push("/chat/");
    };

    const updatedNavigation = navigation.map((item) => {
        if (item.name === "Chat" && Array.isArray(chats)) {
            return {
                ...item,
                children: [
                    ...chats.map((chat) => ({
                        name: chat.title || t("Chat") + " " + chat._id,
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
                                                                )
                                                                    ? "bg-gray-100"
                                                                    : "hover:bg-gray-100",
                                                                "group flex items-center justify-between rounded-md cursor-pointer",
                                                            )}
                                                            onClick={() => {
                                                                setActiveChatId.mutate(
                                                                    subItem.key,
                                                                );
                                                                router.push(
                                                                    subItem.href,
                                                                );
                                                            }}
                                                        >
                                                            <div className="block py-2 pe-2 pl-9 text-sm leading-6 text-gray-700 w-full">
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
