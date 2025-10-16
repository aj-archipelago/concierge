import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import i18next from "i18next";
import {
    EditIcon,
    MoreVertical,
    XIcon,
    UserCircle,
    Trash2,
    Plus,
    Download,
    Upload,
    CheckSquare,
    Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";
import Loader from "../../../app/components/loader";
import {
    useAddChat,
    useDeleteChat,
    useGetChats,
    useSetActiveChatId,
    useUpdateChat,
    useSearchChats,
    useSearchContent,
    useTotalChatCount,
} from "../../../app/queries/chats";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";
import { isValidObjectId } from "../../utils/helper";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";

dayjs.extend(relativeTime);

// Extra bottom padding used when sticky bulk actions are visible
const STICKY_ACTIONS_PADDING_CLASS = "pb-24";
const CONTENT_SEARCH_DEBOUNCE_MS = 250;
const MAX_AUTOLOAD_CHATS_FOR_CONTENT_SEARCH = 200;
const MIN_SEARCH_QUERY_LENGTH = 1;
const MAX_SEARCH_QUERY_LENGTH = 100;
const MAX_CONTENT_SEARCH_RESULTS = 20;

const getCategoryTranslation = (category, t) => {
    const titles = {
        today: t("Today"),
        yesterday: t("Yesterday"),
        thisWeek: t("This Week"),
        thisMonth: t("This Month"),
        older: t("Older"),
    };
    return titles[category] || category;
};

function SavedChats({ displayState }) {
    const { t } = useTranslation();
    const deleteChat = useDeleteChat();
    const isDocked = displayState === "docked";
    const {
        data,
        isLoading: areChatsLoading,
        fetchNextPage,
        isFetchingNextPage,
        hasNextPage,
    } = useGetChats();
    const setActiveChatId = useSetActiveChatId();
    const router = useRouter();
    const addChat = useAddChat();
    const updateChat = useUpdateChat();
    const { getLogo } = config.global;
    const [editingId, setEditingId] = useState(null);
    const [editedName, setEditedName] = useState("");
    const { language } = i18next;
    const [deleteChatId, setDeleteChatId] = useState(null);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
    const stickyExportButtonRef = useRef(null);
    const importInputRef = useRef(null);
    const [noticeDialog, setNoticeDialog] = useState({
        open: false,
        title: "",
        description: "",
    });
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    const getChatIdString = (id) => (typeof id === "string" ? id : String(id));

    const showNotice = (title, description) =>
        setNoticeDialog({ open: true, title, description });

    const allChats = useMemo(() => {
        try {
            const pages = data?.pages || [];
            return pages.flat().filter(Boolean);
        } catch (e) {
            return [];
        }
    }, [data]);

    const isAnyDialogOpen = useMemo(
        () => isBulkDialogOpen || deleteChatId !== null || noticeDialog.open,
        [isBulkDialogOpen, deleteChatId, noticeDialog.open],
    );

    const toggleSelect = (chatId) => {
        if (!chatId) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(chatId)) {
                next.delete(chatId);
            } else {
                next.add(chatId);
            }
            return next;
        });
    };

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);

        // Capture chat titles BEFORE we start deleting to avoid dependency on reactive data
        const chatTitlesById = new Map(
            allChats.map((c) => [getChatIdString(c._id), c.title]),
        );

        // Close dialog first to avoid focus/presence loops during state updates
        setIsBulkDialogOpen(false);

        // Defer deletions until after dialog begins closing to reduce re-entrancy
        setTimeout(async () => {
            setIsBulkProcessing(true);
            const failedIds = [];
            for (const id of ids) {
                try {
                    // Run deletes sequentially to minimize re-renders/focus churn
                    // eslint-disable-next-line no-await-in-loop
                    await deleteChat.mutateAsync({ chatId: id });
                } catch (e) {
                    failedIds.push(id);
                }
            }

            // Now reset selection state
            setSelectedIds(new Set());
            setSelectMode(false);

            if (failedIds.length > 0) {
                const failedLabels = failedIds.map((id) => {
                    const title = chatTitlesById.get(getChatIdString(id));
                    return title && String(title).trim()
                        ? `"${title}"`
                        : getChatIdString(id);
                });
                console.error("Failed to bulk delete chats:", failedLabels);
                showNotice(
                    t("Some deletions failed"),
                    t(
                        "Deleted {{success}} of {{total}} chats. Failed: {{failedList}}. You can try again.",
                        {
                            success: ids.length - failedIds.length,
                            total: ids.length,
                            failedList: failedLabels.join(", "),
                        },
                    ),
                );
            }
            setIsBulkProcessing(false);
        }, 0);
    };

    // Improve keyboard experience: focus the sticky Export button when entering select mode
    useEffect(() => {
        if (selectMode && stickyExportButtonRef.current) {
            stickyExportButtonRef.current.focus();
        }
    }, [selectMode]);

    const handleExportSelected = () => {
        try {
            const byId = new Map(
                allChats.map((c) => [getChatIdString(c._id), c]),
            );
            const selected = Array.from(selectedIds)
                .map((id) => byId.get(getChatIdString(id)))
                .filter(Boolean);
            if (selected.length === 0) return;

            const now = new Date();
            const stamp = now.toISOString().replace(/[:T]/g, "-").split(".")[0];
            const blob = new Blob([JSON.stringify(selected, null, 2)], {
                type: "application/json",
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `chats-export-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (err) {
            console.error("Failed to export chats:", err);
        }
    };

    const handleImportClick = () => {
        if (importInputRef.current) {
            importInputRef.current.click();
        }
    };

    const handleImportFile = async (event) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (parseErr) {
                showNotice(
                    t("Invalid JSON file"),
                    t("import.invalidJsonFileDescription", {
                        message: parseErr.message,
                    }),
                );
                if (importInputRef.current) importInputRef.current.value = "";
                return;
            }

            // Normalize to an array of chats
            if (
                parsed &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
            ) {
                if (Array.isArray(parsed.chats)) parsed = parsed.chats;
                else parsed = [parsed];
            }
            if (!Array.isArray(parsed)) {
                showNotice(
                    t("Unsupported JSON format"),
                    t("import.unsupportedJsonFormatExample"),
                );
                if (importInputRef.current) importInputRef.current.value = "";
                return;
            }

            for (const chat of parsed) {
                try {
                    await addChat.mutateAsync({
                        messages: Array.isArray(chat?.messages)
                            ? chat.messages
                            : [],
                        title:
                            typeof chat?.title === "string" ? chat.title : "",
                    });
                } catch (e) {
                    console.error("Failed to import one chat:", e);
                }
            }

            if (importInputRef.current) importInputRef.current.value = "";
        } catch (err) {
            console.error("Failed to import chats:", err);
        }
    };
    const [searchQuery, setSearchQuery] = useState("");
    const [contentMatches, setContentMatches] = useState([]);
    const [isSearchingContent, setIsSearchingContent] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [serverContentLimit, setServerContentLimit] = useState(20);

    // Search hook for title-only search
    const {
        data: searchResults = [],
        isLoading: isSearching,
        error: titleSearchError,
    } = useSearchChats(searchQuery, { limit: 50 });

    // Debounce server-side content search to prevent flicker while typing
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const debounceTimerRef = useRef(null);
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        debounceTimerRef.current = setTimeout(
            () => setDebouncedSearchQuery(searchQuery),
            CONTENT_SEARCH_DEBOUNCE_MS,
        );
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
        };
    }, [searchQuery]);

    // Server-side content search (fast, CSFLE-safe)
    const {
        data: contentServerResults = [],
        isLoading: isSearchingContentServer,
    } = useSearchContent(debouncedSearchQuery, { limit: serverContentLimit });

    // Sticky UI indicator for content searching to avoid flicker during rapid page fetches
    const [showContentSearching, setShowContentSearching] = useState(false);
    const contentSearchUiTimeoutRef = useRef(null);
    useEffect(() => {
        if (isBulkProcessing) {
            setShowContentSearching(false);
            return;
        }
        if (searchQuery && (isSearchingContentServer || isFetchingNextPage)) {
            setShowContentSearching(true);
            if (contentSearchUiTimeoutRef.current) {
                clearTimeout(contentSearchUiTimeoutRef.current);
                contentSearchUiTimeoutRef.current = null;
            }
        } else if (searchQuery) {
            if (contentSearchUiTimeoutRef.current) {
                clearTimeout(contentSearchUiTimeoutRef.current);
            }
            contentSearchUiTimeoutRef.current = setTimeout(() => {
                setShowContentSearching(false);
                contentSearchUiTimeoutRef.current = null;
            }, 400);
        } else {
            setShowContentSearching(false);
            if (contentSearchUiTimeoutRef.current) {
                clearTimeout(contentSearchUiTimeoutRef.current);
                contentSearchUiTimeoutRef.current = null;
            }
        }
        return () => {
            if (contentSearchUiTimeoutRef.current) {
                clearTimeout(contentSearchUiTimeoutRef.current);
                contentSearchUiTimeoutRef.current = null;
            }
        };
    }, [
        searchQuery,
        isSearchingContentServer,
        isFetchingNextPage,
        isBulkProcessing,
    ]);

    // Get total chat count from database
    const { data: totalChatCount = 0 } = useTotalChatCount();

    // Progressive content search using loaded chats with performance optimizations
    const searchTimeoutRef = useRef(null);
    const autoLoadFetchInProgressRef = useRef(false);

    // Cleanup search timeout on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
                searchTimeoutRef.current = null;
            }
        };
    }, []);

    // Store current data and search results in refs to avoid dependency issues
    const dataRef = useRef(data);
    const searchResultsRef = useRef(searchResults);

    useEffect(() => {
        dataRef.current = data;
        searchResultsRef.current = searchResults;
    }, [data, searchResults]);

    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = null;
        }

        if (isBulkProcessing) {
            setIsSearchingContent((prev) => (prev ? false : prev));
            return;
        }

        if (
            searchQuery.length < MIN_SEARCH_QUERY_LENGTH ||
            !dataRef.current?.pages
        ) {
            setContentMatches((prev) => (prev.length ? [] : prev));
            setSearchError((prev) => (prev ? null : prev));
            setIsSearchingContent((prev) => (prev ? false : prev));
            return;
        }

        if (isSearching) {
            return;
        }

        setIsSearchingContent((prev) => (prev ? prev : true));

        const runSearch = () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
                searchTimeoutRef.current = null;
            }
            try {
                const allLoadedChats = Array.isArray(dataRef.current?.pages)
                    ? dataRef.current.pages.flat()
                    : [];
                const titleIdSet = new Set(
                    (searchResultsRef.current || []).map((chat) =>
                        getChatIdString(chat?._id),
                    ),
                );
                const lowerSearchQuery = searchQuery.toLowerCase();

                const totalLoaded = allLoadedChats.length;
                if (
                    hasNextPage &&
                    totalLoaded < MAX_AUTOLOAD_CHATS_FOR_CONTENT_SEARCH &&
                    !isFetchingNextPage
                ) {
                    if (!autoLoadFetchInProgressRef.current) {
                        autoLoadFetchInProgressRef.current = true;
                        fetchNextPage().finally(() => {
                            autoLoadFetchInProgressRef.current = false;
                        });
                    }
                    return;
                }

                const chatsToSearch = allLoadedChats.filter((chat) => {
                    const id = getChatIdString(chat?._id);
                    return id && !titleIdSet.has(id);
                });

                const matches = [];
                for (const chat of chatsToSearch) {
                    if (!chat.messages?.length) continue;
                    const hasMatch = chat.messages.some(
                        (message) =>
                            typeof message.payload === "string" &&
                            message.payload
                                .toLowerCase()
                                .includes(lowerSearchQuery),
                    );
                    if (hasMatch) {
                        matches.push(chat);
                        if (matches.length >= MAX_CONTENT_SEARCH_RESULTS) break;
                    }
                }

                setContentMatches((prev) => {
                    if (prev.length === matches.length) {
                        let identical = true;
                        for (let i = 0; i < prev.length; i += 1) {
                            const prevId = getChatIdString(prev[i]?._id);
                            const nextId = getChatIdString(matches[i]?._id);
                            if (prevId !== nextId) {
                                identical = false;
                                break;
                            }
                        }
                        if (identical) {
                            return prev;
                        }
                    }
                    return matches;
                });
                setSearchError((prev) => (prev ? null : prev));
            } catch (error) {
                console.error("Content search error:", error);
                setSearchError((prev) =>
                    prev === error.message ? prev : error.message,
                );
                setContentMatches((prev) => (prev.length ? [] : prev));
            } finally {
                setIsSearchingContent((prev) => (prev ? false : prev));
            }
        };

        searchTimeoutRef.current = setTimeout(
            runSearch,
            CONTENT_SEARCH_DEBOUNCE_MS,
        );

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
                searchTimeoutRef.current = null;
            }
        };
    }, [
        searchQuery,
        data,
        searchResults,
        isBulkProcessing,
        isSearching,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
    ]);

    const categorizedChats = useMemo(() => {
        const categories = {
            today: [],
            yesterday: [],
            thisWeek: [],
            thisMonth: [],
            older: [],
        };

        if (!data) return categories;

        const now = dayjs();
        data.pages.forEach((page) => {
            page.forEach((chat) => {
                const chatDate = dayjs(chat.createdAt);
                if (chatDate.isSame(now, "day")) {
                    categories.today.push(chat);
                } else if (chatDate.isSame(now.subtract(1, "day"), "day")) {
                    categories.yesterday.push(chat);
                } else if (chatDate.isSame(now, "week")) {
                    categories.thisWeek.push(chat);
                } else if (chatDate.isSame(now, "month")) {
                    categories.thisMonth.push(chat);
                } else {
                    categories.older.push(chat);
                }
            });
        });

        return categories;
    }, [data]);

    const handleCreateNewChat = async () => {
        try {
            const { _id } = await addChat.mutateAsync({ messages: [] });
            router.push(`/chat/${String(_id)}`);
        } catch (error) {
            console.error("Error adding chat:", error);
        }
    };

    const handleDelete = async (chatId) => {
        try {
            if (isBulkProcessing) return;
            if (!chatId) return;
            await deleteChat.mutateAsync({ chatId });
            setDeleteChatId(null);
        } catch (error) {
            console.error("Failed to delete chat", error);
        }
    };

    const handleSaveEdit = async (chat) => {
        try {
            if (!chat._id || !editedName) return;
            await updateChat.mutateAsync({
                chatId: chat._id,
                title: editedName,
                titleSetByUser: true,
            });
            setEditingId(null);
        } catch (error) {
            console.error("Failed to update chat title", error);
        }
    };

    const renderChatElements = (chats) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
            {chats.map(
                (chat) =>
                    chat &&
                    chat._id &&
                    isValidObjectId(chat._id) && (
                        <div
                            key={chat._id}
                            className="flex flex-col group text-start p-4 border rounded-lg relative min-h-[135px] overflow-auto"
                        >
                            <div className="flex justify-between mb-2 w-full">
                                <div className="flex items-start gap-2 w-full">
                                    {selectMode && (
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(chat._id)}
                                            onChange={() =>
                                                toggleSelect(chat._id)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            className="mt-1"
                                        />
                                    )}
                                    {chat._id && editingId === chat._id ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            className="font-semibold underline focus:ring-0 text-md relative w-full p-0 bg-transparent border-0 ring-0 grow"
                                            value={editedName}
                                            onChange={(e) =>
                                                setEditedName(e.target.value)
                                            }
                                            onBlur={() => {
                                                handleSaveEdit(chat);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    handleSaveEdit(chat);
                                                }
                                                if (e.key === "Escape") {
                                                    setEditingId(null);
                                                }
                                            }}
                                        />
                                    ) : (
                                        <h3
                                            onClick={async () => {
                                                if (selectMode) return; // disable navigation during multiselect
                                                if (editingId !== chat._id) {
                                                    try {
                                                        const chatId = chat._id;
                                                        if (
                                                            !chatId ||
                                                            !isValidObjectId(
                                                                chatId,
                                                            )
                                                        )
                                                            return;
                                                        await setActiveChatId.mutateAsync(
                                                            chatId,
                                                        );
                                                        router.push(
                                                            `/chat/${chatId}`,
                                                        );
                                                    } catch (error) {
                                                        console.error(
                                                            "Failed to set active chat ID:",
                                                            error,
                                                            chat,
                                                        );
                                                    }
                                                }
                                            }}
                                            className="font-semibold text-md relative grow text-start hover:text-sky-500 cursor-pointer"
                                        >
                                            {t(chat.title) || t("New Chat")}
                                        </h3>
                                    )}
                                </div>
                                {!selectMode && !isAnyDialogOpen && (
                                    <div
                                        className={classNames(
                                            editingId === chat._id
                                                ? "flex"
                                                : "hidden sm:group-hover:flex",
                                            "items-center gap-1 -mt-5 -me-2",
                                        )}
                                    >
                                        {editingId === chat._id ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingId(null);
                                                }}
                                                className="text-gray-400 hover:text-gray-700"
                                            >
                                                <XIcon className="h-3 w-3" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingId(chat._id);
                                                    setEditedName(chat.title);
                                                }}
                                                className="text-gray-400 hover:text-gray-700"
                                            >
                                                <EditIcon className="h-3 w-3" />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteChatId(chat._id);
                                            }}
                                            className={classNames(
                                                "text-gray-400 hover:text-red-500",
                                                editingId === chat._id
                                                    ? "hidden"
                                                    : "block",
                                            )}
                                        >
                                            <Trash2 className="h-3 w-3 flex-shrink-0" />
                                        </button>
                                    </div>
                                )}
                                {!selectMode &&
                                    !isAnyDialogOpen &&
                                    editingId !== chat._id && (
                                        <div className="block sm:hidden -me-2 -mt-2">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger className="">
                                                    <MoreVertical className="h-3 w-3 text-gray-400" />
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    {/* add Edit and taxonomy options here */}
                                                    <DropdownMenuItem
                                                        className="text-sm flex items-center gap-2"
                                                        onClick={() => {
                                                            setEditingId(
                                                                chat._id,
                                                            );
                                                            setEditedName(
                                                                chat.title,
                                                            );
                                                        }}
                                                    >
                                                        <EditIcon className="h-3 w-3" />
                                                        {t("Edit title")}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-sm flex items-center gap-2"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteChatId(
                                                                chat._id,
                                                            );
                                                        }}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                        {t("Delete chat")}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    )}
                            </div>
                            <div className="flex justify-between items-center pb-2 overflow-hidden text-start w-full">
                                <ul className="w-full">
                                    {!chat?.messages?.length && (
                                        <li className="text-xs text-gray-500 flex gap-1 items-center overflow-auto">
                                            {t("Empty chat")}
                                        </li>
                                    )}
                                    {chat?.messages
                                        ?.slice(-3)
                                        .map((m, index) => (
                                            <li
                                                key={index}
                                                className={classNames(
                                                    "text-xs text-gray-500 dark:text-gray-400 flex gap-1 items-center overflow-auto",
                                                    m?.sender === "user"
                                                        ? "bg-white dark:bg-gray-800"
                                                        : "bg-sky-50 dark:bg-gray-700",
                                                )}
                                            >
                                                <div className="basis-[1rem] flex items-center gap-1">
                                                    {m?.sender === "user" ? (
                                                        <UserCircle className="w-4 h-4 text-gray-300" />
                                                    ) : (
                                                        <img
                                                            src={getLogo(
                                                                language,
                                                            )}
                                                            alt="Logo"
                                                            className={classNames(
                                                                "w-4 h-4",
                                                            )}
                                                        />
                                                    )}
                                                </div>
                                                <div
                                                    className={classNames(
                                                        "basis-[calc(100%-1rem)] truncate py-0.5",
                                                    )}
                                                >
                                                    {m?.payload}
                                                </div>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                            <span className="text-[.7rem] absolute right-2 bottom-2 text-gray-400 text-right">
                                {dayjs(chat.createdAt).fromNow()}
                            </span>
                        </div>
                    ),
            )}
        </div>
    );

    const getCategoryTitle = (key, count) =>
        `${getCategoryTranslation(key, t)} (${count})`;

    const { ref, inView } = useInView({
        threshold: 0,
    });

    useEffect(() => {
        if (!isBulkProcessing && inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, isBulkProcessing]);

    // Decide which content matches to show (server preferred), then memoize visible sets BEFORE any conditional returns
    const contentMatchesDisplay =
        contentServerResults && contentServerResults.length > 0
            ? contentServerResults
            : contentMatches;

    // Visible chats/ids under current view (search or normal), memoized for performance
    const visibleChats = useMemo(() => {
        if (searchQuery) {
            const title = Array.isArray(searchResults)
                ? searchResults.filter(Boolean)
                : [];
            const content = Array.isArray(contentMatchesDisplay)
                ? contentMatchesDisplay.filter(Boolean)
                : [];
            return [...title, ...content];
        }
        return Array.isArray(allChats) ? allChats : [];
    }, [searchQuery, searchResults, contentMatchesDisplay, allChats]);

    const visibleIdSet = useMemo(() => {
        const set = new Set();
        for (const c of visibleChats) {
            if (c && c._id && isValidObjectId(c._id)) {
                set.add(getChatIdString(c._id));
            }
        }
        return set;
    }, [visibleChats]);

    const visibleIds = useMemo(() => Array.from(visibleIdSet), [visibleIdSet]);

    const allVisibleSelected = useMemo(
        () =>
            visibleIds.length > 0 &&
            visibleIds.every((id) => selectedIds.has(id)),
        [visibleIds, selectedIds],
    );

    if (areChatsLoading) {
        return <Loader />;
    }

    // Prefer showing title loading first; once titles are ready, indicate content search if active
    const statusLabel =
        isSearching || showContentSearching ? t("searching...") : null;

    return (
        <div
            className={`${isDocked ? "text-xs" : ""} pb-4 ${selectMode ? STICKY_ACTIONS_PADDING_CLASS : ""}`}
        >
            <div className="mb-4">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-lg font-semibold">
                            {t("Chat history")}
                        </h1>

                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {searchQuery ? (
                                <div>
                                    {searchResults.length} {t("title matches")}
                                    {contentMatchesDisplay.length > 0 && (
                                        <>
                                            {`, `}
                                            <span>
                                                {contentMatchesDisplay.length >=
                                                serverContentLimit
                                                    ? `${contentMatchesDisplay.length}+`
                                                    : contentMatchesDisplay.length}{" "}
                                                {t("content matches")}
                                            </span>
                                            {contentMatchesDisplay.length >=
                                                serverContentLimit && (
                                                <button
                                                    onClick={() =>
                                                        setServerContentLimit(
                                                            500,
                                                        )
                                                    }
                                                    className="ml-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                    {t("Show all")}
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {` ${t("of")} ${totalChatCount} ${t("total")}`}
                                    {statusLabel && (
                                        <>
                                            <span className="mx-1 text-gray-400 dark:text-gray-500">
                                                •
                                            </span>
                                            <span className="text-blue-500 dark:text-blue-400">
                                                {statusLabel}
                                            </span>
                                        </>
                                    )}
                                </div>
                            ) : (
                                `${data?.pages.flat().length || 0} ${t("chats")} (${totalChatCount} ${t("total")})`
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!selectMode ? (
                            <>
                                <button
                                    onClick={() => setSelectMode(true)}
                                    className="lb-outline flex items-center gap-2"
                                >
                                    <CheckSquare className="h-4 w-4" />
                                    {t("Select")}
                                </button>
                                <input
                                    ref={importInputRef}
                                    type="file"
                                    accept="application/json"
                                    className="hidden"
                                    onChange={handleImportFile}
                                />
                                <button
                                    onClick={handleImportClick}
                                    className="lb-outline-secondary font-medium flex items-center gap-2"
                                >
                                    <Upload className="h-4 w-4" />
                                    {t("Import JSON")}
                                </button>
                                <button
                                    onClick={handleCreateNewChat}
                                    className="lb-primary flex items-center gap-2 "
                                >
                                    <Plus className="h-4 w-4" />
                                    {t("New Chat")}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => {
                                        if (allVisibleSelected) {
                                            // Deselect only visible items, keep others as-is
                                            const next = new Set(
                                                Array.from(selectedIds).filter(
                                                    (id) =>
                                                        !visibleIdSet.has(id),
                                                ),
                                            );
                                            setSelectedIds(next);
                                        } else {
                                            // Select all visible items (merge with any existing selections)
                                            const next = new Set(selectedIds);
                                            for (const id of visibleIds) {
                                                next.add(id);
                                            }
                                            setSelectedIds(next);
                                        }
                                    }}
                                    className="lb-outline flex items-center gap-2"
                                >
                                    {allVisibleSelected
                                        ? t("Deselect All")
                                        : t("Select All")}
                                </button>
                                <button
                                    onClick={handleExportSelected}
                                    disabled={selectedIds.size === 0}
                                    className="lb-secondary font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download className="h-4 w-4" />
                                    {t("Export JSON")} ({selectedIds.size})
                                </button>
                                <button
                                    onClick={() => setIsBulkDialogOpen(true)}
                                    disabled={selectedIds.size === 0}
                                    className="lb-outline-danger flex items-center gap-2 disabled:cursor-not-allowed"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {t("Delete")} ({selectedIds.size})
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectMode(false);
                                        setSelectedIds(new Set());
                                    }}
                                    className="lb-outline flex items-center gap-2"
                                >
                                    <XIcon className="h-4 w-4" />
                                    {t("Cancel")}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Search input */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        type="text"
                        placeholder={t("Search chats...")}
                        value={searchQuery}
                        onChange={(e) => {
                            const value = e.target.value;
                            // Limit search query length to prevent performance issues
                            if (value.length <= MAX_SEARCH_QUERY_LENGTH) {
                                setSearchQuery(value);
                            }
                        }}
                        className="pl-10"
                        maxLength={MAX_SEARCH_QUERY_LENGTH}
                    />
                </div>
            </div>
            <div className="chats">
                {searchQuery ? (
                    // Search results view
                    <div>
                        {isSearching ? (
                            <div className="flex justify-center py-8">
                                <Loader />
                            </div>
                        ) : (
                            <div>
                                {/* Title matches section */}
                                {searchResults.length > 0 && (
                                    <div>
                                        <h2 className="text-md font-semibold mt-4 mb-2 border-b border-gray-200 dark:border-gray-700 pb-1">
                                            📝 {t("Title Matches")} (
                                            {searchResults.length})
                                        </h2>
                                        {renderChatElements(searchResults)}
                                    </div>
                                )}

                                {/* Content matches section */}
                                {contentMatchesDisplay.length > 0 && (
                                    <div>
                                        <h2 className="text-md font-semibold mt-4 mb-2 border-b border-gray-200 dark:border-gray-700 pb-1">
                                            💬 {t("Content Matches")} (
                                            {contentMatchesDisplay.length})
                                        </h2>
                                        {renderChatElements(
                                            contentMatchesDisplay,
                                        )}
                                    </div>
                                )}

                                {/* Error state */}
                                {(titleSearchError || searchError) && (
                                    <div className="text-center py-8 text-red-500">
                                        <div className="text-sm">
                                            {t("An error occurred")}{" "}
                                            {titleSearchError?.message ||
                                                searchError}
                                        </div>
                                    </div>
                                )}

                                {/* No results state */}
                                {!titleSearchError &&
                                    !searchError &&
                                    searchQuery.length >= 1 &&
                                    searchResults.length === 0 &&
                                    contentMatchesDisplay.length === 0 &&
                                    !isSearching &&
                                    !showContentSearching && (
                                        <div className="text-center py-8 text-gray-500">
                                            {t(
                                                "No chats found matching your search",
                                            )}
                                            <div className="text-xs mt-2">
                                                {t("Searched")}{" "}
                                                {data?.pages.flat().length || 0}{" "}
                                                {t("of")} {totalChatCount}{" "}
                                                {t("loaded chats")}
                                            </div>
                                        </div>
                                    )}
                            </div>
                        )}
                    </div>
                ) : (
                    // Normal categorized view
                    Object.entries(categorizedChats).map(
                        ([category, chats]) =>
                            chats.length > 0 && (
                                <div key={category}>
                                    <h2 className="text-md font-semibold mt-4 mb-2 border-b border-gray-200 dark:border-gray-700 pb-1">
                                        {t(
                                            getCategoryTitle(
                                                category,
                                                chats.length,
                                            ),
                                        )}
                                    </h2>
                                    {renderChatElements(chats)}
                                </div>
                            ),
                    )
                )}
            </div>
            {!searchQuery && hasNextPage && (
                <div
                    ref={ref}
                    className="h-10 flex items-center justify-center"
                >
                    {isFetchingNextPage && <Loader />}
                </div>
            )}

            <AlertDialog
                open={deleteChatId !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteChatId(null);
                }}
                modal={false}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Delete Chat?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete this chat? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            className="lb-danger dark:bg-rose-600 dark:hover:bg-rose-700 dark:text-white"
                            onClick={() => handleDelete(deleteChatId)}
                        >
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Notice dialog for user-facing messages */}
            <AlertDialog
                open={noticeDialog.open}
                onOpenChange={(open) =>
                    setNoticeDialog((prev) => ({ ...prev, open }))
                }
                modal={false}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {noticeDialog.title}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {noticeDialog.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction
                            className="lb-primary"
                            onClick={() =>
                                setNoticeDialog((prev) => ({
                                    ...prev,
                                    open: false,
                                }))
                            }
                        >
                            {t("OK")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {selectMode && (
                <div
                    className="fixed bottom-4 left-0 right-0 z-40 flex justify-center pointer-events-none"
                    role="region"
                    aria-label="Bulk actions"
                >
                    <div className="pointer-events-auto bg-white dark:bg-gray-900 border rounded-md shadow-md px-3 py-2 flex items-center gap-2">
                        <span className="text-sm">
                            {t("Selected")} {selectedIds.size}
                        </span>
                        <button
                            ref={stickyExportButtonRef}
                            onClick={handleExportSelected}
                            disabled={selectedIds.size === 0}
                            className="lb-secondary flex items-center gap-2 disabled:cursor-not-allowed"
                        >
                            <Download className="h-4 w-4" />
                            {t("Export JSON")}
                        </button>
                        <button
                            onClick={() => setIsBulkDialogOpen(true)}
                            disabled={selectedIds.size === 0}
                            className="lb-danger flex items-center gap-2 disabled:cursor-not-allowed"
                        >
                            <Trash2 className="h-4 w-4" />
                            {t("Delete")}
                        </button>
                        <button
                            onClick={() => {
                                setSelectMode(false);
                                setSelectedIds(new Set());
                            }}
                            className="lb-outline flex items-center gap-2"
                        >
                            <XIcon className="h-4 w-4" />
                            {t("Cancel")}
                        </button>
                    </div>
                </div>
            )}

            <AlertDialog
                open={isBulkDialogOpen}
                onOpenChange={setIsBulkDialogOpen}
                modal={false}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete selected chats?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete the selected chats? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            className="lb-danger dark:bg-rose-600 dark:hover:bg-rose-700 dark:text-white"
                            onClick={handleBulkDelete}
                        >
                            {t("Delete")} ({selectedIds.size})
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default SavedChats;
