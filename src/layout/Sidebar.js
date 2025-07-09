import {
    ChatBubbleLeftIcon,
    CodeBracketIcon,
    HomeIcon,
    PlusIcon,
} from "@heroicons/react/24/outline";
import {
    HelpCircle,
    PinIcon,
    PinOffIcon,
    Settings,
    AppWindow,
} from "lucide-react";
import * as Icons from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    useAddChat,
    useDeleteChat,
    useGetActiveChats,
    useSetActiveChatId,
} from "../../app/queries/chats";
import { useCurrentUser } from "../../app/queries/users";
import classNames from "../../app/utils/class-names";
import config from "../../config";
import SendFeedbackModal from "../components/help/SendFeedbackModal";
import { LanguageContext } from "../contexts/LanguageProvider";
import ChatNavigationItem from "./ChatNavigationItem";
import { cn } from "@/lib/utils";

// Helper function to get icon component
const getIconComponent = (iconName) => {
    if (!iconName) return AppWindow; // Default fallback

    // Check if it's a Lucide icon
    if (Icons[iconName]) {
        return Icons[iconName];
    }

    // Fallback to default icon
    return AppWindow;
};

// App slug to navigation item mapping
const appNavigationMap = {
    home: {
        name: "Home",
        href: "/home",
    },
    chat: {
        name: "Chat",
        href: "/chat",
        children: [],
    },
    translate: {
        name: "Translate",
        href: "/translate",
    },
    video: {
        name: "Video",
        href: "/video",
    },
    write: {
        name: "Write",
        href: "/write",
    },
    workspaces: {
        name: "Workspaces",
        href: "/workspaces",
    },
    media: {
        name: "Media",
        href: "/media",
    },
    jira: {
        name: "Jira",
        href: "/code/jira",
    },
};

// Legacy navigation for backward compatibility
export const navigation = Object.values(appNavigationMap);

const routesToCollapseSidebarFor = ["/workspaces/"];

export const shouldForceCollapse = (pathname) => {
    return (
        navigation.some(
            (item) => item.collapsed && pathname?.startsWith(item.href),
        ) ||
        routesToCollapseSidebarFor.some((route) => pathname?.startsWith(route))
    );
};

export default React.forwardRef(function Sidebar(
    { isCollapsed: propIsCollapsed, onToggleCollapse, isMobile },
    ref,
) {
    const pathname = usePathname();
    const router = useRouter();
    const { getLogo, getSidebarLogo } = config.global;
    const { language } = useContext(LanguageContext);
    const { t } = useTranslation();
    const { data: chatsData = [] } = useGetActiveChats();
    const chats = chatsData || [];
    const { data: currentUser } = useCurrentUser();

    const deleteChat = useDeleteChat();
    const setActiveChatId = useSetActiveChatId();
    const addChat = useAddChat();

    const isCollapsed =
        (propIsCollapsed || shouldForceCollapse(pathname)) && !isMobile;

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

    // Create navigation based on user's apps
    const getUserNavigation = () => {
        // Always start with Home and Chat
        const coreNavigation = [
            { ...appNavigationMap.home, icon: Icons.HomeIcon },
            { ...appNavigationMap.chat, icon: Icons.MessageCircleIcon },
        ];

        if (!currentUser?.apps || currentUser.apps.length === 0) {
            // Fallback to default navigation if user has no apps
            return coreNavigation;
        }

        // Sort user apps by order
        const sortedUserApps = [...currentUser.apps].sort(
            (a, b) => a.order - b.order,
        );

        // Create navigation items based on user's apps (excluding home and chat)
        const userAppNavigation = sortedUserApps
            .map((userApp) => {
                const app = userApp.appId; // This is now populated with app details

                if (!app) {
                    return null;
                }

                // Skip home and chat as they're always included
                if (app.slug === "home" || app.slug === "chat") {
                    return null;
                }

                // Handle applet apps differently
                if (app.type === "applet" && app.workspaceId) {
                    return {
                        name: app.name || "Applet",
                        icon: Icons[app.icon] || AppWindow,
                        href: `/published/workspaces/${app.workspaceId}/applet`,
                        appId: userApp.appId._id || userApp.appId,
                    };
                }

                // Find the navigation item for this app
                const navItem = appNavigationMap[app.slug];

                if (!navItem) {
                    return null;
                }

                // Use icon from database, fallback to default AppWindow icon
                const iconComponent =
                    app.icon && app.icon.trim()
                        ? getIconComponent(app.icon)
                        : AppWindow;

                return {
                    ...navItem,
                    icon: iconComponent,
                    appId: userApp.appId._id || userApp.appId,
                };
            })
            .filter(Boolean); // Remove null items

        // Combine core navigation with user apps
        return [...coreNavigation, ...userAppNavigation];
    };

    const userNavigation = getUserNavigation();

    const updatedNavigation = userNavigation.map((item) => {
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
                "flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-5 relative z-[41]",
                isCollapsed &&
                    "group overflow-y-hidden hover:overflow-y-auto hover:w-56 w-16 transition-[width] duration-100 shadow-xl",
                !isCollapsed && "w-56 overflow-y-auto",
            )}
        >
            <div className="relative">
                <button
                    onClick={onToggleCollapse}
                    className={cn(
                        "hidden bg-white border border-gray-200 rounded-full p-1 shadow-sm hover:bg-gray-50",
                        shouldForceCollapse(pathname)
                            ? "lg:hidden"
                            : "group-hover:block",
                        isCollapsed
                            ? "mx-auto mt-4 hidden group-hover:mt-0 group-hover:absolute group-hover:-right-3 group-hover:top-5"
                            : "mx-auto lg:block absolute -right-3 top-5",
                    )}
                >
                    {isCollapsed ? (
                        <PinIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                        <PinOffIcon className="h-4 w-4 text-gray-400" />
                    )}
                </button>
            </div>

            <div
                className={cn(
                    "flex h-16 shrink-0 items-center gap-2",
                    isCollapsed ? "-mx-2" : "justify-start",
                )}
            >
                <Link className="flex items-center gap-2" href="/">
                    <img
                        className={cn(
                            "w-auto",
                            isCollapsed ? "group-hover:h-12" : "block h-12",
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
                        <ul className="-mx-2 space-y-1 overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
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
                            <button
                                className="flex gap-2 items-center text-sm w-full"
                                onClick={() => router.push("/apps")}
                            >
                                <Settings className="h-6 w-6 shrink-0 text-gray-400" />
                                <span
                                    className={cn(
                                        "text-sm text-gray-500",
                                        isCollapsed &&
                                            "hidden group-hover:block",
                                    )}
                                >
                                    {t("Manage Apps")}
                                </span>
                            </button>
                        </div>
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
