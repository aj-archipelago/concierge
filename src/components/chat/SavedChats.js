import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import i18next from "i18next";
import {
    EditIcon,
    UserCircle,
    Trash2,
    Plus,
    Upload,
    Check,
    Download,
    X,
    Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import Loader from "../../../app/components/loader";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import {
    useAddChat,
    useBulkDeleteChats,
    useBulkImportChats,
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
import { getChatIdString, isValidObjectId } from "../../utils/helper";
import { useItemSelection } from "../images/hooks/useItemSelection";
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
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";
import BulkActionsBar from "../common/BulkActionsBar";
import FilterInput from "../common/FilterInput";
import EmptyState from "../common/EmptyState";

dayjs.extend(relativeTime);

const CONTENT_SEARCH_DEBOUNCE_MS = 250;
const MAX_AUTOLOAD_CHATS_FOR_CONTENT_SEARCH = 200;
const MIN_SEARCH_QUERY_LENGTH = 1;
const MAX_SEARCH_QUERY_LENGTH = 100;
const MAX_CONTENT_SEARCH_RESULTS = 20;
const DEFAULT_TITLE_SEARCH_LIMIT = 50;
const MAX_TITLE_SEARCH_LIMIT = 500;

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
    const bulkImportChats = useBulkImportChats();
    const bulkDeleteChats = useBulkDeleteChats();
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

    // Use shared selection hook
    const {
        selectedIds,
        lastSelectedId,
        clearSelection: clearSelectionHook,
        toggleSelection,
        selectRange: selectRangeHook,
        setSelectedIds,
    } = useItemSelection((chat) => getChatIdString(chat._id));

    const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
    const [isLoadingAll, setIsLoadingAll] = useState(false);
    const [shouldSelectAll, setShouldSelectAll] = useState(false);
    const importInputRef = useRef(null);
    const chatsContainerRef = useRef(null);
    const [noticeDialog, setNoticeDialog] = useState({
        open: false,
        title: "",
        description: "",
    });
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [showSharedOnly, setShowSharedOnly] = useState(false);
    const queryClient = useQueryClient();

    const summarizeItems = useCallback(
        (items, limit = 10) => {
            if (!Array.isArray(items) || items.length === 0) return "";
            const display = items.slice(0, limit);
            const remaining = items.length - display.length;
            if (remaining > 0) {
                return `${display.join(", ")} ${t("moreLabel", { count: remaining })}`;
            }
            return display.join(", ");
        },
        [t],
    );

    const translateOrDefault = useCallback(
        (key, fallback, options) => {
            const result = t(key, options);
            if (result === key) {
                return typeof fallback === "function" ? fallback() : fallback;
            }
            return result;
        },
        [t],
    );

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

    const sharedChats = useMemo(() => {
        if (!Array.isArray(allChats)) return [];
        return allChats.filter((chat) => chat?.isPublic);
    }, [allChats]);

    const shouldIncludeChat = useCallback(
        (chat) => !showSharedOnly || Boolean(chat?.isPublic),
        [showSharedOnly],
    );

    const filterSharedChats = useCallback(
        (chats) => {
            if (!Array.isArray(chats)) {
                return [];
            }

            if (!showSharedOnly) {
                return chats;
            }

            return chats.filter(shouldIncludeChat);
        },
        [showSharedOnly, shouldIncludeChat],
    );

    // Wrapper to clear selection and reset last selected
    const clearSelection = useCallback(() => {
        clearSelectionHook();
    }, [clearSelectionHook]);

    const handleBulkDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;

        const chatTitlesById = new Map(
            allChats.map((c) => [getChatIdString(c._id), c.title]),
        );

        setIsBulkDialogOpen(false);
        setTimeout(async () => {
            try {
                setIsBulkProcessing(true);
                const { deletedIds = [], missingIds = [] } =
                    (await bulkDeleteChats.mutateAsync({ chatIds: ids })) || {};

                const deletedSet = new Set(
                    (deletedIds || []).map((id) => getChatIdString(id)),
                );
                const notDeleted = new Set(
                    (missingIds || [])
                        .map((id) => getChatIdString(id))
                        .filter((id) => !deletedSet.has(id)),
                );

                clearSelection();

                if (notDeleted.size > 0) {
                    const failedLabels = Array.from(notDeleted).map((id) => {
                        const title = chatTitlesById.get(id);
                        return title && String(title).trim()
                            ? `"${title}"`
                            : id;
                    });
                    const removedCount = ids.length - failedLabels.length;
                    const summary = removedCount
                        ? t("deletedSome", {
                              success: removedCount,
                              total: ids.length,
                          })
                        : t("deletedNone");
                    const preview = summarizeItems(failedLabels);
                    showNotice(
                        t("Some chats stayed"),
                        preview ? `${summary}\n${preview}` : summary,
                    );
                }
            } catch (error) {
                console.error("Failed to bulk delete chats", error);
                showNotice(
                    t("Bulk delete failed"),
                    error.message || String(error),
                );
            } finally {
                setIsBulkProcessing(false);
            }
        }, 0);
    };

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
                    translateOrDefault(
                        "import.invalidJsonFileDescription",
                        () =>
                            `We couldn't parse that file (${parseErr.message || ""}).`,
                        { message: parseErr.message },
                    ),
                );
                if (importInputRef.current) importInputRef.current.value = "";
                return;
            }

            let importedChats = [];
            if (Array.isArray(parsed)) {
                importedChats = parsed;
            } else if (parsed && typeof parsed === "object") {
                if (Array.isArray(parsed.chats)) importedChats = parsed.chats;
                else importedChats = [parsed];
            }

            if (!importedChats.length) {
                showNotice(
                    t("Unsupported JSON format"),
                    translateOrDefault(
                        "import.unsupportedJsonFormatExample",
                        "Please provide a list of chats with messages.",
                    ),
                );
                if (importInputRef.current) importInputRef.current.value = "";
                return;
            }

            const {
                createdCount = 0,
                errors = [],
                createdChats = [],
            } = (await bulkImportChats.mutateAsync({ chats: importedChats })) ||
            {};

            if (createdChats.length) {
                const existingIds = new Set(
                    (Array.isArray(data?.pages) ? data.pages.flat() : [])
                        .map((chat) => getChatIdString(chat?._id))
                        .filter(Boolean),
                );
                const merged = [
                    ...createdChats.filter((chat) => {
                        const id = getChatIdString(chat?._id);
                        if (!id) return false;
                        if (existingIds.has(id)) return false;
                        existingIds.add(id);
                        return true;
                    }),
                    ...allChats,
                ];
                clearSelection();
                queryClient.setQueryData(["chats"], {
                    pages: [merged, ...(data?.pages?.slice(1) || [])],
                    pageParams: data?.pageParams || [],
                });
            }

            clearSelection();

            if (errors.length > 0) {
                const errorLabels = errors.map(
                    (err) => `${t("Chat")} ${err.index + 1}: ${err.error}`,
                );
                const summary = createdCount
                    ? t("importPartialSummary", {
                          success: createdCount,
                          total: importedChats.length,
                      })
                    : t("importZeroSummary");
                const preview = summarizeItems(errorLabels);
                showNotice(
                    t("Some imports skipped"),
                    preview ? `${summary}\n${preview}` : summary,
                );
            }
        } catch (err) {
            console.error("Failed to import chats:", err);
            showNotice(t("Import failed"), err?.message || String(err));
        } finally {
            if (importInputRef.current) importInputRef.current.value = "";
        }
    };

    const [searchQuery, setSearchQuery] = useState("");
    const [contentMatches, setContentMatches] = useState([]);
    const [searchError, setSearchError] = useState(null);
    const [serverContentLimit, setServerContentLimit] = useState(20);
    const [bottomActionsLeft, setBottomActionsLeft] = useState(null);

    // Debounce search query to prevent API calls on every keystroke
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const debounceTimerRef = useRef(null);

    // Title search limit - needs to be declared before the useEffect that uses it
    const [titleSearchLimit, setTitleSearchLimit] = useState(
        DEFAULT_TITLE_SEARCH_LIMIT,
    );

    // Debounce effect - reset limit and debounce search query
    useEffect(() => {
        setTitleSearchLimit(DEFAULT_TITLE_SEARCH_LIMIT);
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

    // Search hook for title-only search (uses debounced query)
    const {
        data: searchResults = [],
        isLoading: isSearching,
        error: titleSearchError,
    } = useSearchChats(debouncedSearchQuery, { limit: titleSearchLimit });

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
        if (
            searchQuery &&
            (isSearchingContentServer || isFetchingNextPage || isSearching)
        ) {
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
        isSearching,
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
            return;
        }

        if (
            searchQuery.length < MIN_SEARCH_QUERY_LENGTH ||
            !dataRef.current?.pages
        ) {
            setContentMatches((prev) => (prev.length ? [] : prev));
            setSearchError((prev) => (prev ? null : prev));
            return;
        }

        if (isSearching) {
            return;
        }

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
            filterSharedChats(page).forEach((chat) => {
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
    }, [data, filterSharedChats]);

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

            // Only update if the title actually changed
            if (editedName === chat.title) {
                setEditingId(null);
                return;
            }

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

    const handleChatClick = async (chat, e) => {
        // If clicking on the title in edit mode or if any input element, don't navigate
        if (editingId === chat._id) return;
        if (e?.target?.tagName === "INPUT") return;

        try {
            const chatId = chat._id;
            if (!chatId || !isValidObjectId(chatId)) return;
            await setActiveChatId.mutateAsync(chatId);
            router.push(`/chat/${chatId}`);
        } catch (error) {
            console.error("Failed to set active chat ID:", error, chat);
        }
    };

    const renderChatElements = (chats) => {
        const uniqueChats = [];
        const seenIds = new Set();

        for (const chat of chats) {
            if (!chat) continue;
            const id = getChatIdString(chat._id);
            if (!id || seenIds.has(id)) continue;
            seenIds.add(id);
            uniqueChats.push(chat);
        }

        return (
            <div className="chat-grid">
                {uniqueChats.map(
                    (chat) =>
                        chat &&
                        chat._id &&
                        isValidObjectId(chat._id) && (
                            <div
                                key={chat._id}
                                className="chat-tile cursor-pointer"
                                onClick={(e) => handleChatClick(chat, e)}
                            >
                                {/* Selection checkbox - always visible */}
                                <div
                                    className={`selection-checkbox ${selectedIds.has(chat._id) ? "selected" : ""}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const chatIdStr = getChatIdString(
                                            chat._id,
                                        );
                                        if (e.shiftKey && lastSelectedId) {
                                            // Find indices for range selection
                                            const lastIndex =
                                                uniqueChats.findIndex(
                                                    (c) =>
                                                        getChatIdString(
                                                            c._id,
                                                        ) === lastSelectedId,
                                                );
                                            const currentIndex =
                                                uniqueChats.findIndex(
                                                    (c) =>
                                                        getChatIdString(
                                                            c._id,
                                                        ) === chatIdStr,
                                                );

                                            if (
                                                lastIndex !== -1 &&
                                                currentIndex !== -1
                                            ) {
                                                const start = Math.min(
                                                    lastIndex,
                                                    currentIndex,
                                                );
                                                const end = Math.max(
                                                    lastIndex,
                                                    currentIndex,
                                                );
                                                selectRangeHook(
                                                    uniqueChats,
                                                    start,
                                                    end,
                                                );
                                            }
                                        } else {
                                            toggleSelection(chat);
                                        }
                                    }}
                                >
                                    <Check
                                        className={`text-sm ${selectedIds.has(chat._id) ? "opacity-100" : "opacity-0"}`}
                                    />
                                </div>

                                {/* Chat content wrapper */}
                                <div className="p-4 flex flex-col h-full">
                                    {/* Title */}
                                    {chat._id && editingId === chat._id ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            className="font-semibold underline focus:ring-0 text-md w-full p-0 mb-2 bg-transparent border-0 ring-0"
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
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <h3
                                                    className="font-semibold text-md truncate flex-1 cursor-pointer hover:text-sky-500"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingId(chat._id);
                                                        setEditedName(
                                                            chat.title,
                                                        );
                                                    }}
                                                >
                                                    {t(chat.title) ||
                                                        t("New Chat")}
                                                </h3>
                                                {chat.isPublic && (
                                                    <div
                                                        className="flex-shrink-0 flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full"
                                                        title={t("Shared chat")}
                                                    >
                                                        <Users className="w-3 h-3 text-white" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingId(chat._id);
                                                        setEditedName(
                                                            chat.title,
                                                        );
                                                    }}
                                                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                                                    title={t("Edit title")}
                                                >
                                                    <EditIcon className="h-3 w-3" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteChatId(
                                                            chat._id,
                                                        );
                                                    }}
                                                    className="text-gray-400 hover:text-red-500"
                                                    title={t("Delete")}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Messages preview */}
                                    <div className="flex-1 overflow-hidden">
                                        <ul className="w-full">
                                            {!chat?.messages?.length && (
                                                <li className="text-xs text-gray-500 flex gap-1 items-center">
                                                    {t("Empty chat")}
                                                </li>
                                            )}
                                            {chat?.messages
                                                ?.slice(-3)
                                                .map((m, index) => (
                                                    <li
                                                        key={index}
                                                        className={classNames(
                                                            "text-xs text-gray-500 dark:text-gray-400 flex gap-1 items-center overflow-hidden mb-0.5",
                                                            m?.sender === "user"
                                                                ? "bg-white dark:bg-gray-800"
                                                                : "bg-sky-50 dark:bg-gray-700",
                                                        )}
                                                    >
                                                        <div className="flex-shrink-0 flex items-center gap-1">
                                                            {m?.sender ===
                                                            "user" ? (
                                                                <UserCircle className="w-4 h-4 text-gray-300" />
                                                            ) : (
                                                                <img
                                                                    src={getLogo(
                                                                        language,
                                                                    )}
                                                                    alt="Logo"
                                                                    className="w-4 h-4"
                                                                />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 truncate py-0.5">
                                                            {m?.payload}
                                                        </div>
                                                    </li>
                                                ))}
                                        </ul>
                                    </div>

                                    {/* Timestamp */}
                                    <div className="text-[.7rem] text-gray-400 text-right mt-2">
                                        {dayjs(chat.createdAt).fromNow()}
                                    </div>
                                </div>
                            </div>
                        ),
                )}
            </div>
        );
    };

    const getCategoryTitle = (key, count) =>
        `${getCategoryTranslation(key, t)} (${count})`;

    // Infinite scroll with additional condition: don't load if bulk processing
    const { ref } = useInfiniteScroll({
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        additionalConditions: [!isBulkProcessing],
    });

    const filteredSearchResults = useMemo(
        () => filterSharedChats(searchResults),
        [filterSharedChats, searchResults],
    );

    // Decide which content matches to show (server preferred), then memoize visible sets BEFORE any conditional returns
    // Filter out any content matches that are already in title matches to avoid duplicates
    const titleMatchIds = useMemo(() => {
        return new Set(
            (filteredSearchResults || [])
                .filter(Boolean)
                .map((chat) => getChatIdString(chat._id))
                .filter(Boolean),
        );
    }, [filteredSearchResults]);

    const contentMatchesDisplay = useMemo(() => {
        const rawContentMatches =
            contentServerResults && contentServerResults.length > 0
                ? contentServerResults
                : contentMatches;

        // Filter out any chats that are already in title matches and apply shared filter
        const sharedContentMatches = filterSharedChats(rawContentMatches);

        return sharedContentMatches.filter((chat) => {
            if (!chat?._id) return false;
            const chatIdStr = getChatIdString(chat._id);
            if (!chatIdStr || titleMatchIds.has(chatIdStr)) return false;

            return true;
        });
    }, [
        contentServerResults,
        contentMatches,
        titleMatchIds,
        filterSharedChats,
    ]);

    const updateBottomActionsPosition = useCallback(() => {
        if (typeof window === "undefined") {
            return;
        }
        const container = chatsContainerRef.current;
        if (container) {
            const rect = container.getBoundingClientRect();
            if (rect?.width) {
                setBottomActionsLeft(rect.left + rect.width / 2);
                return;
            }
        }
        setBottomActionsLeft(window.innerWidth / 2);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        updateBottomActionsPosition();
        window.addEventListener("resize", updateBottomActionsPosition);
        return () =>
            window.removeEventListener("resize", updateBottomActionsPosition);
    }, [updateBottomActionsPosition]);

    useEffect(() => {
        updateBottomActionsPosition();
    }, [
        updateBottomActionsPosition,
        selectedIds.size,
        searchQuery,
        contentMatchesDisplay.length,
        searchResults.length,
        allChats.length,
    ]);

    // Visible chats/ids under current view (search or normal), memoized for performance
    const visibleChats = useMemo(() => {
        if (searchQuery) {
            const title = Array.isArray(filteredSearchResults)
                ? filteredSearchResults.filter(Boolean)
                : [];
            const content = Array.isArray(contentMatchesDisplay)
                ? contentMatchesDisplay.filter(Boolean)
                : [];
            return [...title, ...content];
        }
        if (showSharedOnly) {
            return sharedChats;
        }
        return Array.isArray(allChats) ? allChats : [];
    }, [
        searchQuery,
        filteredSearchResults,
        contentMatchesDisplay,
        allChats,
        showSharedOnly,
        sharedChats,
    ]);

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

    // Calculate the count of visible chats for display
    const visibleChatCount = useMemo(() => {
        if (searchQuery) {
            return visibleChats.length;
        }
        if (showSharedOnly) {
            // Count shared chats when filter is active
            return sharedChats.length;
        }
        return totalChatCount;
    }, [
        searchQuery,
        showSharedOnly,
        visibleChats.length,
        sharedChats.length,
        totalChatCount,
    ]);

    const allVisibleSelected = useMemo(
        () =>
            visibleIds.length > 0 &&
            visibleIds.every((id) => selectedIds.has(id)),
        [visibleIds, selectedIds],
    );

    // Load all pages before selecting all
    const handleToggleVisibleSelection = useCallback(async () => {
        // If all visible are already selected, deselect them
        if (allVisibleSelected) {
            const next = new Set(
                Array.from(selectedIds).filter((id) => !visibleIdSet.has(id)),
            );
            setSelectedIds(next);
            return;
        }

        // If there are more pages to load in non-search mode, load them first
        if (!searchQuery && hasNextPage) {
            setIsLoadingAll(true);
            setShouldSelectAll(true);
            try {
                // Keep fetching pages - fetchNextPage returns updated query info
                let result = await fetchNextPage();
                while (result.hasNextPage && !result.isFetchingNextPage) {
                    result = await fetchNextPage();
                }
            } catch (error) {
                console.error("Error loading all pages:", error);
                setShouldSelectAll(false);
            } finally {
                setIsLoadingAll(false);
            }
        } else {
            // No more pages or in search mode, just select visible items
            const next = new Set(selectedIds);
            for (const id of visibleIds) {
                next.add(id);
            }
            setSelectedIds(next);
        }
    }, [
        allVisibleSelected,
        selectedIds,
        visibleIdSet,
        searchQuery,
        hasNextPage,
        fetchNextPage,
        visibleIds,
        setSelectedIds,
    ]);

    // Effect to select all items once loading is complete
    useEffect(() => {
        if (shouldSelectAll && !isLoadingAll && !hasNextPage) {
            const allLoadedChats = data?.pages?.flat() || [];
            const next = new Set(selectedIds);
            for (const chat of allLoadedChats) {
                const id = getChatIdString(chat?._id);
                if (id && isValidObjectId(chat._id)) {
                    next.add(id);
                }
            }
            setSelectedIds(next);
            setShouldSelectAll(false);
        }
    }, [
        shouldSelectAll,
        isLoadingAll,
        hasNextPage,
        data?.pages,
        selectedIds,
        setSelectedIds,
    ]);

    const handleShowAllResults = useCallback(() => {
        setTitleSearchLimit(MAX_TITLE_SEARCH_LIMIT);
        setServerContentLimit(500);
    }, []);

    if (areChatsLoading) {
        return <Loader />;
    }

    // Prefer showing title loading first; once titles are ready, indicate content search if active
    const statusLabel =
        isSearching || showContentSearching ? t("searching...") : null;

    const isTitleLimitReached =
        Boolean(searchQuery) &&
        titleSearchLimit < MAX_TITLE_SEARCH_LIMIT &&
        filteredSearchResults.length >= titleSearchLimit;

    const titleMatchesCountDisplay = isTitleLimitReached
        ? `${titleSearchLimit}+`
        : filteredSearchResults.length;

    const isContentLimitReached =
        Boolean(searchQuery) &&
        contentMatchesDisplay.length >= serverContentLimit;

    const shouldShowAllResults = isTitleLimitReached || isContentLimitReached;

    return (
        <div className={`${isDocked ? "text-xs" : ""} pb-4`}>
            <div className="mb-4">
                {/* Header with title and count */}
                <div className="mb-4">
                    <h1 className="text-lg font-semibold">
                        {t("Chat history")}
                    </h1>

                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {searchQuery ? (
                            <div>
                                <span>
                                    {titleMatchesCountDisplay}{" "}
                                    {t("title matches")}
                                </span>
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
                                        {shouldShowAllResults && (
                                            <button
                                                onClick={handleShowAllResults}
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
                            `${visibleChatCount} ${t("chats")}`
                        )}
                    </div>
                </div>

                {/* Filter and Action Controls */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    {/* Filter Search Control */}
                    <FilterInput
                        value={searchQuery}
                        onChange={(value) => {
                            // Limit search query length to prevent performance issues
                            if (value.length <= MAX_SEARCH_QUERY_LENGTH) {
                                setSearchQuery(value);
                            }
                        }}
                        onClear={() => setSearchQuery("")}
                        placeholder={t(
                            'Search chats... (e.g., interview notes or "campaign strategy")',
                        )}
                        className="w-full sm:flex-1 sm:max-w-lg"
                    />

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <div className="text-sm text-gray-500 mr-2">
                            {selectedIds.size > 0 && (
                                <span>
                                    {selectedIds.size} {t("selected")}
                                </span>
                            )}
                        </div>
                        <TooltipProvider>
                            {/* Shared Chats Toggle - its own group */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className={`lb-icon-button ${
                                            showSharedOnly
                                                ? "lb-primary text-white"
                                                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                        }`}
                                        onClick={() =>
                                            setShowSharedOnly(!showSharedOnly)
                                        }
                                    >
                                        <Users className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {showSharedOnly
                                        ? t("Show All Chats")
                                        : t("Show Shared Chats Only")}
                                </TooltipContent>
                            </Tooltip>

                            {/* Separator - after shared chats group */}
                            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

                            {/* Export button - always visible, disabled when nothing selected */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className={`lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500 ${
                                            selectedIds.size === 0
                                                ? "opacity-50 cursor-not-allowed"
                                                : ""
                                        }`}
                                        disabled={selectedIds.size === 0}
                                        onClick={handleExportSelected}
                                    >
                                        <Download />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>{t("Export")}</TooltipContent>
                            </Tooltip>

                            {/* Delete button - always visible, disabled when nothing selected */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className={`lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500 ${
                                            selectedIds.size === 0
                                                ? "opacity-50 cursor-not-allowed"
                                                : ""
                                        }`}
                                        disabled={selectedIds.size === 0}
                                        onClick={() =>
                                            setIsBulkDialogOpen(true)
                                        }
                                    >
                                        <Trash2 />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t("Delete Selected")}
                                </TooltipContent>
                            </Tooltip>

                            {/* Clear Selection button - always visible, disabled when nothing selected */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className={`lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500 ${
                                            selectedIds.size === 0
                                                ? "opacity-50 cursor-not-allowed"
                                                : ""
                                        }`}
                                        disabled={selectedIds.size === 0}
                                        onClick={clearSelection}
                                    >
                                        <X />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t("Clear Selection")}
                                </TooltipContent>
                            </Tooltip>

                            {/* Separator - after selection group */}
                            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

                            {/* Import button */}
                            <input
                                ref={importInputRef}
                                type="file"
                                accept="application/json"
                                className="hidden"
                                onChange={handleImportFile}
                            />
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                        onClick={handleImportClick}
                                    >
                                        <Upload />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>{t("Import")}</TooltipContent>
                            </Tooltip>

                            {/* New Chat button - using lb-primary brand blue */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className="lb-primary inline-flex items-center justify-center h-9 w-9 p-0"
                                        onClick={handleCreateNewChat}
                                    >
                                        <Plus className="h-5 w-5" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>{t("New Chat")}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            </div>
            <div ref={chatsContainerRef} className="chats">
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
                                {filteredSearchResults.length > 0 && (
                                    <div>
                                        <h2 className="text-md font-semibold mt-4 mb-2 border-b border-gray-200 dark:border-gray-700 pb-1">
                                            📝 {t("Title Matches")} (
                                            {titleMatchesCountDisplay})
                                        </h2>
                                        {renderChatElements(
                                            filteredSearchResults,
                                        )}
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
                                    filteredSearchResults.length === 0 &&
                                    contentMatchesDisplay.length === 0 &&
                                    !isSearching &&
                                    !showContentSearching && (
                                        <EmptyState
                                            icon={
                                                <svg
                                                    className="w-16 h-16 mx-auto"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={1}
                                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                                    />
                                                </svg>
                                            }
                                            title={t(
                                                "No chats found matching your search",
                                            )}
                                            description={t(
                                                "Try different search terms or clear the search",
                                            )}
                                            action={() => setSearchQuery("")}
                                            actionLabel={t("Clear Search")}
                                        />
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

            {/* Floating Bulk Actions Bar */}
            <BulkActionsBar
                selectedCount={selectedIds.size}
                allSelected={allVisibleSelected}
                onSelectAll={handleToggleVisibleSelection}
                onClearSelection={clearSelection}
                bottomActionsLeft={bottomActionsLeft}
                isLoadingAll={isLoadingAll}
                actions={{
                    download: {
                        onClick: handleExportSelected,
                        disabled: false,
                        label: t("Export"),
                        ariaLabel: `${t("Export")} (${selectedIds.size})`,
                    },
                    delete: {
                        onClick: () => setIsBulkDialogOpen(true),
                        disabled: false,
                        label: t("Delete"),
                        ariaLabel: `${t("Delete")} (${selectedIds.size})`,
                    },
                }}
            />
        </div>
    );
}

export default SavedChats;
