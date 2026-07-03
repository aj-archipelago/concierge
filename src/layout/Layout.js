"use client";
import { Dialog, Transition } from "@headlessui/react";
import { Menu, X, MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useContext, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Flip, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AuthContext } from "../App";
import ChatBox from "../components/chat/ChatBox";
import UpdatesButton from "../components/help/UpdatesButton";
import NotificationButton from "../components/notifications/NotificationButton";
import Tos from "../components/Tos";
import PersonalizationPortal from "../components/portal/PersonalizationPortal";
import { PortalContext } from "../contexts/PortalContext";
import { LanguageContext } from "../contexts/LanguageProvider";
import { ProgressProvider } from "../contexts/ProgressContext";
import { ThemeContext } from "../contexts/ThemeProvider";
import { setChatBoxPosition, focusChatInput } from "../stores/chatSlice";
import { shouldRenderAppletWithoutChrome } from "../utils/appletChrome";
import Footer from "./Footer";
import ProfileDropdown from "./ProfileDropdown";
import Sidebar from "./Sidebar";
import { cn } from "@/lib/utils";
import config from "../../config";

const ROUTES_WITHOUT_SIDEBAR = ["/wp-editor"];
const SIDEBAR_PIN_STORAGE_KEY = "concierge-sidebar-pinned";

function getInitialSidebarPinned() {
    if (typeof window === "undefined") {
        return false;
    }

    try {
        return window.localStorage.getItem(SIDEBAR_PIN_STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

export default function Layout({ children, initialActiveChats }) {
    const [showPortal, setShowPortal] = useState(false);
    const [portalTab, setPortalTab] = useState("discover");
    const [portalSubTab, setPortalSubTab] = useState("connectors");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarPinned, setSidebarPinned] = useState(getInitialSidebarPinned);
    const [sidebarEditMode, setSidebarEditMode] = useState(false);
    const [sidebarInteractionExpanded, setSidebarInteractionExpanded] =
        useState(false);
    const [showTos, setShowTos] = useState(false);
    const statePosition = useSelector((state) => state.chat?.chatBox?.position);
    const dispatch = useDispatch();
    const { user } = useContext(AuthContext);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { theme } = useContext(ThemeContext);
    const { direction, language } = useContext(LanguageContext);
    const { getLogo, getSidebarLogo, siteTitle } = config.global;
    const contentRef = useRef(null);
    const openChatHandledRef = useRef(false);
    const shouldRenderChromeFreeApplet = shouldRenderAppletWithoutChrome(
        pathname,
        searchParams,
    );

    const openPortal = (tab = "discover", subTab = "connectors") => {
        setPortalTab(tab);
        setPortalSubTab(subTab);
        setShowPortal(true);
    };
    const closePortal = () => setShowPortal(false);

    const showChatbox =
        !shouldRenderChromeFreeApplet &&
        statePosition !== "closed" &&
        pathname !== "/chat" &&
        !pathname?.startsWith("/write");

    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    // Restore ChatBox position when leaving pages that force-close it (/chat, /write).
    const posBeforeForceRef = useRef(null);
    useEffect(() => {
        const forced =
            pathname === "/chat" ||
            pathname?.startsWith("/chat/") ||
            pathname?.startsWith("/write");
        if (forced && statePosition !== "closed") {
            posBeforeForceRef.current = statePosition;
        } else if (!forced && posBeforeForceRef.current) {
            dispatch(
                setChatBoxPosition({ position: posBeforeForceRef.current }),
            );
            posBeforeForceRef.current = null;
        }
    }, [pathname, statePosition, dispatch]);

    // Handle openChat query parameter
    useEffect(() => {
        const openChat = searchParams?.get("openChat");

        // Only handle if openChat=true and we haven't already handled it for this navigation
        // Don't open docked chat on Write page since it already has its own chat
        if (
            !shouldRenderChromeFreeApplet &&
            openChat === "true" &&
            pathname !== "/chat" &&
            !pathname.startsWith("/chat/") &&
            !pathname?.startsWith("/write")
        ) {
            // Reset the handled flag when pathname changes
            if (openChatHandledRef.current) {
                openChatHandledRef.current = false;
            }

            if (!openChatHandledRef.current) {
                openChatHandledRef.current = true;

                // Set chat box to docked position
                dispatch(setChatBoxPosition({ position: "docked" }));

                // Focus the chat input after a short delay to ensure chat box is rendered
                setTimeout(() => {
                    dispatch(focusChatInput());
                }, 300);
            }
        } else {
            // Reset flag when openChat is not present or on chat pages
            openChatHandledRef.current = false;
        }
    }, [searchParams, pathname, dispatch, shouldRenderChromeFreeApplet]);

    // Add viewport height fix for mobile browsers
    useEffect(() => {
        // Function to update the viewport height CSS variable
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty("--vh", `${vh}px`);
        };

        // Set the viewport height initially
        setViewportHeight();

        // Update the viewport height on resize
        window.addEventListener("resize", setViewportHeight);

        // Clean up the event listener
        return () => window.removeEventListener("resize", setViewportHeight);
    }, []);

    const handleToggleSidebarPin = () => {
        setSidebarPinned((currentValue) => {
            const nextValue = !currentValue;
            try {
                window.localStorage.setItem(
                    SIDEBAR_PIN_STORAGE_KEY,
                    nextValue ? "true" : "false",
                );
            } catch {
                // Ignore localStorage errors; the in-memory state still updates.
            }
            return nextValue;
        });
    };

    const isCollapsed = !sidebarPinned && !sidebarEditMode;
    const isSidebarVisuallyExpanded =
        !isCollapsed || sidebarInteractionExpanded;
    const shouldReserveExpandedSidebar = !isCollapsed;

    if (ROUTES_WITHOUT_SIDEBAR.includes(pathname)) {
        return <>{children}</>;
    }

    if (shouldRenderChromeFreeApplet) {
        return (
            <div
                className="h-screen min-h-screen w-full bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100"
                dir={direction}
            >
                {children}
            </div>
        );
    }

    return (
        <PortalContext.Provider value={{ openPortal, closePortal }}>
            <>
                <div>
                    <Transition.Root show={sidebarOpen} as={Fragment}>
                        <Dialog
                            as="div"
                            className="relative z-50 lg:hidden"
                            onClose={setSidebarOpen}
                        >
                            <Transition.Child
                                as={Fragment}
                                enter="transition-opacity ease-linear duration-300"
                                enterFrom="opacity-0"
                                enterTo="opacity-100"
                                leave="transition-opacity ease-linear duration-300"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0"
                            >
                                <div className="fixed inset-0 bg-gray-900/80" />
                            </Transition.Child>

                            <div className="fixed inset-0 flex">
                                <Transition.Child
                                    as={Fragment}
                                    enter="transition ease-in-out duration-300 transform"
                                    enterFrom={
                                        direction === "ltr"
                                            ? "-translate-x-full"
                                            : "translate-x-full"
                                    }
                                    enterTo={
                                        direction === "ltr"
                                            ? "translate-x-0"
                                            : "-translate-x-0"
                                    }
                                    leave="transition ease-in-out duration-300 transform"
                                    leaveFrom={
                                        direction === "ltr"
                                            ? "translate-x-0"
                                            : "-translate-x-0"
                                    }
                                    leaveTo={
                                        direction === "ltr"
                                            ? "-translate-x-full"
                                            : "translate-x-full"
                                    }
                                >
                                    <Dialog.Panel className="relative me-16 flex w-full max-w-xs flex-1">
                                        <Transition.Child
                                            as={Fragment}
                                            enter="ease-in-out duration-300"
                                            enterFrom="opacity-0"
                                            enterTo="opacity-100"
                                            leave="ease-in-out duration-300"
                                            leaveFrom="opacity-100"
                                            leaveTo="opacity-0"
                                        >
                                            <div className="absolute start-full top-0 flex w-16 justify-center pt-5">
                                                <button
                                                    type="button"
                                                    className="-m-2.5 p-2.5"
                                                    onClick={() =>
                                                        setSidebarOpen(false)
                                                    }
                                                >
                                                    <span className="sr-only">
                                                        Close sidebar
                                                    </span>
                                                    <X
                                                        className="h-6 w-6 text-white dark:text-gray-100"
                                                        aria-hidden="true"
                                                    />
                                                </button>
                                            </div>
                                        </Transition.Child>
                                        {/* Sidebar component, swap this element with another sidebar if you like */}
                                        <Sidebar
                                            ref={contentRef}
                                            isMobile={true}
                                            isPinned={sidebarPinned}
                                            onTogglePin={handleToggleSidebarPin}
                                            isEditingSidebar={sidebarEditMode}
                                            onToggleSidebarEdit={() =>
                                                setSidebarEditMode(
                                                    (value) => !value,
                                                )
                                            }
                                            initialActiveChats={
                                                initialActiveChats
                                            }
                                        />
                                    </Dialog.Panel>
                                </Transition.Child>
                            </div>
                        </Dialog>
                    </Transition.Root>

                    {/* Static sidebar for desktop */}
                    <div
                        className={cn(
                            "hidden lg:fixed lg:inset-y-0 lg:z-[41] lg:flex lg:flex-col transition-all duration-300",
                            isSidebarVisuallyExpanded ? "lg:w-56" : "lg:w-16",
                        )}
                    >
                        <Sidebar
                            ref={contentRef}
                            isCollapsed={isCollapsed}
                            isPinned={sidebarPinned}
                            onTogglePin={handleToggleSidebarPin}
                            isEditingSidebar={sidebarEditMode}
                            onInteractionExpandedChange={
                                setSidebarInteractionExpanded
                            }
                            onToggleSidebarEdit={() =>
                                setSidebarEditMode((value) => !value)
                            }
                            initialActiveChats={initialActiveChats}
                        />
                    </div>

                    <div
                        className={cn(
                            "transition-all duration-300",
                            shouldReserveExpandedSidebar
                                ? "lg:ps-56"
                                : "lg:ps-16",
                        )}
                    >
                        <div className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-x-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 shadow-sm sm:gap-x-6 sm:px-3 lg:px-4">
                            <button
                                type="button"
                                className="-m-2.5 p-2.5 text-gray-700 dark:text-gray-300 lg:hidden"
                                onClick={() => setSidebarOpen(true)}
                            >
                                <span className="sr-only">Open sidebar</span>
                                <Menu className="h-6 w-6" aria-hidden="true" />
                            </button>

                            {/* Separator */}
                            <div
                                className="h-6 w-px bg-gray-900/10 dark:bg-gray-100/10 lg:hidden"
                                aria-hidden="true"
                            />

                            <Link
                                className="flex min-w-0 items-center gap-2.5 leading-tight"
                                href="/"
                            >
                                <img
                                    className="h-10 w-10 shrink-0 rounded-lg object-contain"
                                    src={getLogo(language, theme)}
                                    alt={siteTitle}
                                />
                                <span className="min-w-0 overflow-hidden leading-none">
                                    {getSidebarLogo(language)}
                                </span>
                            </Link>

                            <div className="flex flex-1 items-center gap-x-3 justify-end ">
                                <div className="flex gap-3">
                                    <div className="flex items-center">
                                        <UpdatesButton />
                                    </div>
                                    <div className="flex items-center">
                                        <NotificationButton />
                                    </div>
                                    {!pathname?.includes("/chat") &&
                                        !pathname?.startsWith("/write") && (
                                            <div className="hidden sm:flex items-center">
                                                <button
                                                    disabled={/^\/chat(\/|$)/.test(
                                                        pathname,
                                                    )}
                                                    onClick={() => {
                                                        if (
                                                            statePosition ===
                                                            "docked"
                                                        ) {
                                                            dispatch(
                                                                setChatBoxPosition(
                                                                    {
                                                                        position:
                                                                            "closed",
                                                                    },
                                                                ),
                                                            );
                                                        } else {
                                                            dispatch(
                                                                setChatBoxPosition(
                                                                    {
                                                                        position:
                                                                            "docked",
                                                                    },
                                                                ),
                                                            );
                                                        }
                                                    }}
                                                    className="relative mt-1"
                                                >
                                                    <MessageCircle
                                                        fill={
                                                            statePosition ===
                                                                "docked" ||
                                                            pathname === "/chat"
                                                                ? "#0284c7"
                                                                : "none"
                                                        }
                                                        stroke="#0284c7"
                                                        className="h-5 w-5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                                                    />
                                                </button>
                                            </div>
                                        )}
                                </div>
                                <div>
                                    <ProfileDropdown
                                        user={user}
                                        handleShowOptions={() =>
                                            openPortal("discover")
                                        }
                                        setShowTos={setShowTos}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="relative flex-col">
                            <ProgressProvider>
                                <main
                                    className={`p-2 bg-slate-50 dark:bg-gray-900 flex ${showChatbox ? "gap-2" : ""}`}
                                    ref={contentRef}
                                >
                                    <div
                                        className={`${showChatbox ? "grow" : "w-full"} bg-white dark:bg-gray-800 dark:border-gray-700 rounded-md border p-3 lg:p-4 lg:pb-3 overflow-auto relative`}
                                        style={{
                                            height: "calc((var(--vh, 1vh) * 100) - 105px)",
                                        }}
                                    >
                                        <PersonalizationPortal
                                            open={showPortal}
                                            onClose={closePortal}
                                            initialTab={portalTab}
                                            initialSubTab={portalSubTab}
                                        />
                                        <Tos
                                            showTos={showTos}
                                            setShowTos={setShowTos}
                                        />
                                        {children}
                                    </div>
                                    {showChatbox && (
                                        <div
                                            className="hidden sm:block h-[calc(100vh-105px)]"
                                            style={{
                                                height: "calc((var(--vh, 1vh) * 100) - 105px)",
                                                flexShrink: 0,
                                            }}
                                        >
                                            <ChatBox />
                                        </div>
                                    )}
                                    <ToastContainer
                                        position={
                                            direction === "rtl"
                                                ? "top-left"
                                                : "top-right"
                                        }
                                        autoClose={10000}
                                        hideProgressBar={false}
                                        newestOnTop={false}
                                        closeOnClick
                                        rtl={direction === "rtl"}
                                        pauseOnFocusLoss
                                        draggable
                                        pauseOnHover
                                        theme={
                                            theme === "dark" ? "dark" : "light"
                                        }
                                        transition={Flip}
                                    />
                                </main>
                            </ProgressProvider>
                            <Footer />
                        </div>
                    </div>
                </div>
            </>
        </PortalContext.Provider>
    );
}
