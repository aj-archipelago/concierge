import {
    ChatBubbleLeftIcon,
    CodeBracketIcon,
    GlobeAltIcon,
    NewspaperIcon,
    PencilSquareIcon,
    PhotoIcon,
    PlusIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { HelpCircle, VideoIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineWorkspaces } from "react-icons/md";
import {
    useAddChat,
    useDeleteChat,
    useGetActiveChats,
    useSetActiveChatId,
} from "../../app/queries/chats";
import classNames from "../../app/utils/class-names";
import config from "../../config";
import SendFeedbackModal from "../components/help/SendFeedbackModal";
import { LanguageContext } from "../contexts/LanguageProvider";
import ChatNavigationItem from "./ChatNavigationItem";
import { cn } from "@/lib/utils";

export const navigation = [
    {
        name: "Home",
        icon: NewspaperIcon,
        href: "/home",
    },
    { name: "Chat", icon: ChatBubbleLeftIcon, href: "/chat", children: [] },
    { name: "Translate", icon: GlobeAltIcon, href: "/translate" },
    { name: "Video", icon: VideoIcon, href: "/video" },
    { name: "Write", icon: PencilSquareIcon, href: "/write" },
    {
        name: "Workspaces",
        icon: MdOutlineWorkspaces,
        href: "/workspaces",
        collapsed: true,
    },
    { name: "Images", icon: PhotoIcon, href: "/images" },
    { name: "Jira", icon: CodeBracketIcon, href: "/code/jira" },
];

const routesToCollapseSidebarFor = ["/published"];

export const shouldForceCollapse = (pathname) => {
    return (
        navigation.some(
            (item) => item.collapsed && pathname?.startsWith(item.href),
        ) ||
        routesToCollapseSidebarFor.some((route) => pathname?.startsWith(route))
    );
};

export default React.forwardRef(function Sidebar(
    { isCollapsed: propIsCollapsed, onToggleCollapse },
    ref,
) {
    const pathname = usePathname();
    const router = useRouter();
    const { getLogo, getSidebarLogo } = config.global;
    const { language } = useContext(LanguageContext);
    const { t } = useTranslation();
    const { data: chatsData = [] } = useGetActiveChats();
    const chats = chatsData || [];

    const deleteChat = useDeleteChat();
    const setActiveChatId = useSetActiveChatId();
    const addChat = useAddChat();

    const isCollapsed = propIsCollapsed || shouldForceCollapse(pathname);

    const handleNewChat = async () => {
        try {
            const { _id } = await addChat.mutateAsync({ messages: [] });
            router.push(`/chat/${String(_id)}`);
        } catch (error) {
            console.error("Error adding chat:", error);
        }
    };

    const handleDeleteChat = async (chatId) => {
        try {
            const { activeChatId, recentChatIds } =
                await deleteChat.mutateAsync({ chatId });
            if (activeChatId) {
                router.push(`/chat/${activeChatId}`);
            } else if (recentChatIds?.[0]) {
                router.push(`/chat/${recentChatIds?.[0]}`);
            }
        } catch (error) {
            console.error("Error deleting chat:", error);
        }
    };

    const updatedNavigation = navigation.map((item) => {
        if (item.name === "Chat" && Array.isArray(chats)) {
            const items = chats.slice(0, 3);
            return {
                ...item,
                children: items.map((chat) => ({
                    name: (() => {
                        // If there's a custom title, use it
                        if (chat?.title && chat.title !== "New Chat") {
                            return chat.title;
                        }

                        // If there's a firstMessage property (from backend), use it
                        if (chat?.firstMessage?.payload) {
                            return chat.firstMessage.payload;
                        }

                        // If there's a message in the messages array, use it
                        if (chat?.messages && chat?.messages[0]?.payload) {
                            return chat.messages[0].payload;
                        }

                        // Otherwise use "New Chat"
                        return t("New Chat");
                    })(),
                    href: chat._id ? `/chat/${chat._id}` : ``,
                    key: chat._id,
                })),
            };
        }
        return item;
    });

    return (
        <div
            className={cn(
                "flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-5 relative z-[70]",
                isCollapsed &&
                    "group hover:w-56 w-16 transition-[width] duration-200",
                !isCollapsed && "w-56",
            )}
        >
            <div className="relative">
                <button
                    onClick={onToggleCollapse}
                    className={cn(
                        "bg-white border border-gray-200 rounded-full p-1 hidden lg:block shadow-sm hover:bg-gray-50",
                        shouldForceCollapse(pathname) && "lg:hidden",
                        isCollapsed
                            ? "mx-auto mt-4 group-hover:mt-0 group-hover:absolute group-hover:-right-3 group-hover:top-5"
                            : "absolute -right-3 top-5",
                    )}
                >
                    {isCollapsed ? (
                        <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                        <ChevronLeftIcon className="h-4 w-4 text-gray-400" />
                    )}
                </button>
            </div>

            <div className="flex h-16 shrink-0 items-center gap-2">
                <Link className="flex items-center gap-2" href="/">
                    <img
                        className={cn(
                            "w-auto h-12",
                            isCollapsed ? "hidden group-hover:block" : "block",
                        )}
                        src={getLogo(language)}
                        alt="Your Company"
                    />
                    <div
                        className={cn(
                            "transition-all",
                            isCollapsed ? "hidden group-hover:block" : "",
                        )}
                    >
                        {getSidebarLogo(language)}
                    </div>
                </Link>
            </div>
            <nav className="flex flex-1 flex-col">
                <ul className="flex flex-1 flex-col gap-y-4">
                    <li className="grow">
                        <ul className="-mx-2 space-y-1 max-h-[calc(100vh-155px)] overflow-y-auto overflow-x-hidden">
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
                                            <span
                                                className={cn(
                                                    "select-none",
                                                    isCollapsed
                                                        ? "hidden group-hover:inline"
                                                        : "inline",
                                                )}
                                            >
                                                {t(item.name)}
                                            </span>
                                        </div>
                                        {item.name === "Chat" && (
                                            <PlusIcon
                                                className={cn(
                                                    "h-6 w-6 ml-auto p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-800 cursor-pointer",
                                                    isCollapsed
                                                        ? "hidden group-hover:inline"
                                                        : "inline",
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleNewChat();
                                                }}
                                            />
                                        )}
                                    </div>
                                    {item.children?.length > 0 && (
                                        <ul
                                            className={cn(
                                                "mt-1 px-1",
                                                isCollapsed
                                                    ? "hidden group-hover:block"
                                                    : "block",
                                            )}
                                        >
                                            {item.children.map(
                                                (subItem, index) =>
                                                    item.name === "Chat" ? (
                                                        <ChatNavigationItem
                                                            key={
                                                                subItem.key ||
                                                                `${item.name}-${index}`
                                                            }
                                                            subItem={subItem}
                                                            pathname={pathname}
                                                            router={router}
                                                            setActiveChatId={
                                                                setActiveChatId
                                                            }
                                                            handleDeleteChat={
                                                                handleDeleteChat
                                                            }
                                                            isCollapsed={
                                                                isCollapsed
                                                            }
                                                        />
                                                    ) : (
                                                        <li
                                                            key={
                                                                subItem.key ||
                                                                `${item.name}-${index}`
                                                            }
                                                            className={classNames(
                                                                "group flex items-center justify-between rounded-md cursor-pointer hover:bg-gray-100 my-0.5",
                                                                pathname ===
                                                                    subItem?.href
                                                                    ? "bg-gray-100"
                                                                    : "",
                                                            )}
                                                            onClick={() => {
                                                                if (
                                                                    subItem.href
                                                                ) {
                                                                    router.push(
                                                                        subItem.href,
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            <div
                                                                className={`relative block py-2 pe-1 ${"text-xs ps-4 pe-4"} leading-6 text-gray-700 w-full select-none flex items-center justify-between`}
                                                                dir={
                                                                    document
                                                                        .documentElement
                                                                        .dir
                                                                }
                                                            >
                                                                <span
                                                                    className={`${
                                                                        document
                                                                            .documentElement
                                                                            .dir ===
                                                                        "rtl"
                                                                            ? "pe-3"
                                                                            : "ps-3"
                                                                    } truncate whitespace-nowrap overflow-hidden max-w-[150px]`}
                                                                    title={t(
                                                                        subItem.name ||
                                                                            "",
                                                                    )}
                                                                >
                                                                    {t(
                                                                        subItem.name ||
                                                                            "",
                                                                    )}
                                                                </span>
                                                            </div>
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
                            <SendFeedbackButton
                                ref={ref}
                                isCollapsed={isCollapsed}
                            />
                        </div>
                    </li>
                </ul>
            </nav>
        </div>
    );
});

const SendFeedbackButton = React.forwardRef(function SendFeedbackButton(
    { isCollapsed },
    ref,
) {
    const [show, setShow] = useState(false);
    const { t } = useTranslation();

    const handleClick = () => setShow(true);

    return (
        <>
            <SendFeedbackModal
                ref={ref}
                show={show}
                onHide={() => setShow(false)}
            />
            <button
                className="flex gap-2 items-center text-sm"
                onClick={handleClick}
            >
                <HelpCircle className="h-6 w-6 shrink-0 text-gray-400" />
                {!isCollapsed && t("Send feedback")}
            </button>
        </>
    );
});
