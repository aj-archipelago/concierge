"use client";
import { Dialog, Transition } from "@headlessui/react";
import { Menu, X, MessageCircle } from "lucide-react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
    Fragment,
    useContext,
    useEffect,
    useRef,
    useState,
    useCallback,
    useMemo,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { Flip, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AuthContext } from "../App";
import ChatBox from "../components/chat/ChatBox";
import UpdatesButton from "../components/help/UpdatesButton";
import NotificationButton from "../components/notifications/NotificationButton";
import Tos from "../components/Tos";
import PersonalizationPortal from "../components/portal/PersonalizationPortal";
import TourOverlay from "../components/tour/TourOverlay";
import { PortalContext } from "../contexts/PortalContext";
import { AppHeaderContext } from "../contexts/AppHeaderContext";
import { LanguageContext } from "../contexts/LanguageProvider";
import { ProgressProvider } from "../contexts/ProgressContext";
import { ThemeContext } from "../contexts/ThemeProvider";
import { setChatBoxPosition, focusChatInput } from "../stores/chatSlice";
import { shouldRenderAppletWithoutChrome } from "../utils/appletChrome";
import Footer from "./Footer";
import ProfileDropdown from "./ProfileDropdown";
import Sidebar from "./Sidebar";
import SidebarBrand from "./SidebarBrand";
import AdminNav from "../../app/admin/components/AdminNav";
import { getPageHeaderTitle } from "./pageHeaderTitles";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

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
    const [pageHeaderTarget, setPageHeaderTarget] = useState(null);
    const [headerOwners, setHeaderOwners] = useState(0);
    const registerHeader = useCallback(() => {
        setHeaderOwners((count) => count + 1);
        return () => setHeaderOwners((count) => count - 1);
    }, []);
    const statePosition = useSelector((state) => state.chat?.chatBox?.position);
    const dispatch = useDispatch();
    const { user } = useContext(AuthContext);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { theme } = useContext(ThemeContext);
    const { direction } = useContext(LanguageContext);
    const { t } = useTranslation();
    const isConversationPage =
        pathname?.startsWith("/chat/") || pathname === "/write";
    const appHeader = useMemo(
        () => ({
            target: pageHeaderTarget,
            direction,
            register: registerHeader,
            navigation: pathname?.startsWith("/admin") ? <AdminNav /> : null,
        }),
        [pageHeaderTarget, registerHeader, pathname, direction],
    );
    const contentRef = useRef(null);
    const openChatHandledRef = useRef(false);
    const shouldRenderChromeFreeApplet = shouldRenderAppletWithoutChrome(
        pathname,
        searchParams,
    );

    const openPortal = (tab = "discover", subTab = "connectors") => {
        if (["ai-assistant", "memory", "colleagues"].includes(tab)) {
            setShowPortal(false);
            router.push(
                tab === "colleagues"
                    ? "/colleagues"
                    : `/colleagues?entity=${encodeURIComponent(user?.personalEntityId || "")}&tab=${tab === "memory" ? "memory" : "options"}`,
            );
            return;
        }
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

    const renderSidebarHeader = ({ collapsed }) => (
        <SidebarBrand collapsed={collapsed} />
    );

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
            <AppHeaderContext.Provider value={appHeader}>
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
                                                        {t("Close sidebar")}
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
                                            onNavigate={() =>
                                                setSidebarOpen(false)
                                            }
                                            renderHeader={renderSidebarHeader}
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
                            isSidebarVisuallyExpanded ? "lg:w-56" : "lg:w-14",
                        )}
                    >
                        <Sidebar
                            renderHeader={renderSidebarHeader}
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
                            "flex min-h-0 flex-col transition-all duration-300",
                            shouldReserveExpandedSidebar
                                ? "lg:ps-56"
                                : "lg:ps-14",
                        )}
                        style={{ height: "calc(var(--vh, 1vh) * 100)" }}
                    >
                        <header
                            data-app-header
                            dir={direction}
                            className="sticky top-0 z-40 grid min-h-16 shrink-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-1 border-b border-gray-200 bg-white px-2 py-2 sm:px-3 lg:flex lg:gap-x-3 lg:px-4 dark:border-gray-700 dark:bg-gray-800"
                        >
                            <button
                                type="button"
                                className="col-start-1 row-start-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 lg:hidden dark:text-gray-300 dark:hover:bg-gray-700"
                                onClick={() => setSidebarOpen(true)}
                                aria-label={t("Open sidebar")}
                            >
                                <Menu className="h-5 w-5" aria-hidden="true" />
                            </button>
                            <div
                                ref={setPageHeaderTarget}
                                data-app-page-header-slot
                                className="contents lg:flex lg:min-w-0 lg:flex-1"
                            >
                                {headerOwners === 0 && (
                                    <h1 className="col-start-2 row-start-1 min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">
                                        {t(getPageHeaderTitle(pathname))}
                                    </h1>
                                )}
                            </div>
                            <div
                                data-app-header-actions
                                className="col-start-3 row-start-1 flex shrink-0 items-center gap-0.5 sm:gap-2"
                            >
                                <UpdatesButton buttonClassName="m-0 flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 [&>span]:end-0 [&>span]:top-0" />
                                <NotificationButton buttonClassName="m-0 flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 [&>span]:end-0 [&>span]:top-0" />
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
                                                            setChatBoxPosition({
                                                                position:
                                                                    "closed",
                                                            }),
                                                        );
                                                    } else {
                                                        dispatch(
                                                            setChatBoxPosition({
                                                                position:
                                                                    "docked",
                                                            }),
                                                        );
                                                    }
                                                }}
                                                aria-label={t(
                                                    "Toggle chat panel",
                                                )}
                                                className="relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
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

                                <ProfileDropdown
                                    user={user}
                                    handleShowOptions={() =>
                                        openPortal("discover")
                                    }
                                    setShowTos={setShowTos}
                                    buttonClassName="h-10 w-10 border-4 border-white dark:border-gray-800"
                                />
                            </div>
                        </header>

                        <div className="relative flex min-h-0 flex-1 flex-col">
                            <ProgressProvider>
                                <main
                                    className={cn(
                                        "flex min-h-0 flex-1 bg-slate-50 dark:bg-gray-900",
                                        isConversationPage ? "p-0" : "p-2",
                                        showChatbox && "gap-2",
                                    )}
                                    ref={contentRef}
                                >
                                    <div
                                        className={cn(
                                            `${showChatbox ? "grow" : "w-full"} bg-white dark:bg-gray-800 dark:border-gray-700 rounded-md border p-3 lg:p-4 lg:pb-3 overflow-auto relative`,
                                            isConversationPage &&
                                                "rounded-none border-0",
                                        )}
                                    >
                                        <AppHeaderContext.Provider value={null}>
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
                                        </AppHeaderContext.Provider>
                                        {children}
                                    </div>
                                    {showChatbox && (
                                        <div
                                            className="hidden min-h-0 sm:block"
                                            style={{
                                                flexShrink: 0,
                                            }}
                                        >
                                            <AppHeaderContext.Provider
                                                value={null}
                                            >
                                                <ChatBox />
                                            </AppHeaderContext.Provider>
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
                <TourOverlay />
            </AppHeaderContext.Provider>
        </PortalContext.Provider>
    );
}
