"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
    EditIcon,
    Trash2,
    Plus,
    Upload,
    Check,
    Download,
    X,
    Users,
    LayoutGrid,
    List,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import { startNewChat } from "../../utils/requestChatInputFocus";
import Loader from "../../../app/components/loader";
import axios from "../../../app/utils/axios-client";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import {
    useBulkDeleteChats,
    useBulkImportChats,
    useDeleteChat,
    useGetChats,
    useUpdateChat,
    useSearchChats,
    useSearchContent,
    useTotalChatCount,
} from "../../../app/queries/chats";
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
import { extractSearchableText } from "../../utils/assistantInlinePayload";
import {
    parseSearchQuery,
    matchesAllTerms,
} from "../../../app/api/utils/search-parser";
import BulkActionsBar from "../common/BulkActionsBar";
import FilterInput from "../common/FilterInput";
import EmptyState from "../common/EmptyState";
import { renderChatMarkdownMessage } from "./chatMarkdownRenderer";

dayjs.extend(relativeTime);

const CONTENT_SEARCH_DEBOUNCE_MS = 250;
const MAX_AUTOLOAD_CHATS_FOR_CONTENT_SEARCH = 200;
const MIN_SEARCH_QUERY_LENGTH = 1;
const MAX_SEARCH_QUERY_LENGTH = 100;
const MAX_CONTENT_SEARCH_RESULTS = 20;
const DEFAULT_TITLE_SEARCH_LIMIT = 50;
const MAX_TITLE_SEARCH_LIMIT = 500;
const VIRTUALIZE_THRESHOLD = 80;
const VIRTUAL_ROW_GAP_PX = 16;
const VIRTUAL_HEADER_HEIGHT_PX = 36;
const VIRTUAL_OVERSCAN_ROWS = 5;
const CHAT_VIEW_MODE_STORAGE_KEY = "concierge.savedChats.viewMode";
const CHAT_LIST_VIEW = "list";
const CHAT_GRID_VIEW = "grid";
const GRID_MIN_CARD_WIDTH_PX = 260;
const GRID_CARD_HEIGHT_PX = 156;
const CHAT_VIEW_OPTIONS = [
    {
        mode: CHAT_LIST_VIEW,
        label: "List view",
        testId: "saved-chats-list-view",
        Icon: List,
    },
    {
        mode: CHAT_GRID_VIEW,
        label: "Grid view",
        testId: "saved-chats-grid-view",
        Icon: LayoutGrid,
    },
];

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

const ChatPreviewMarkdown = memo(function ChatPreviewMarkdown({ previewText }) {
    if (!previewText) return null;

    // Previews come from stored message text and may contain raw HTML; render
    // through the markdown pipeline with rehypeRaw disabled so any embedded
    // <script>/<img onerror>/etc. is escaped instead of executed.
    return renderChatMarkdownMessage({
        message: { payload: previewText },
        finalRender: true,
        allowRawHtml: false,
    });
});

function SavedChats({ displayState, initialChats = null }) {
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
    } = useGetChats({ initialPage: initialChats || undefined });
    const router = useRouter();
    const params = useParams();
    const pathname = usePathname();
    const dispatch = useDispatch();
    const updateChat = useUpdateChat();
    const [chatViewMode, setChatViewMode] = useState(() => {
        if (typeof window === "undefined") return CHAT_LIST_VIEW;
        try {
            const storedMode = window.localStorage.getItem(
                CHAT_VIEW_MODE_STORAGE_KEY,
            );
            return storedMode === CHAT_GRID_VIEW
                ? CHAT_GRID_VIEW
                : CHAT_LIST_VIEW;
        } catch (error) {
            return CHAT_LIST_VIEW;
        }
    });
    const [editingId, setEditingId] = useState(null);
    const [editedName, setEditedName] = useState("");
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
    const [virtualScrollTop, setVirtualScrollTop] = useState(0);
    const [virtualContainerSize, setVirtualContainerSize] = useState({
        width: 0,
        height: 0,
    });
    const [noticeDialog, setNoticeDialog] = useState({
        open: false,
        title: "",
        description: "",
    });
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [showSharedOnly, setShowSharedOnly] = useState(false);
    const [shouldFetchTotalCount, setShouldFetchTotalCount] = useState(false);
    const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
    const queryClient = useQueryClient();
    const isGridView = chatViewMode === CHAT_GRID_VIEW;

    const handleChatViewModeChange = useCallback((mode) => {
        setChatViewMode(mode);
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(CHAT_VIEW_MODE_STORAGE_KEY, mode);
        } catch (error) {
            // Ignore storage failures; the toggle still works for this session.
        }
    }, []);

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
            const flattened = pages.flat().filter(Boolean);
            return flattened;
        } catch (e) {
            return [];
        }
    }, [data]);

    const filterSharedChats = useCallback(
        (chats) => {
            if (!Array.isArray(chats)) {
                return [];
            }

            if (!showSharedOnly) {
                return chats;
            }

            return chats.filter((chat) => Boolean(chat?.isPublic));
        },
        [showSharedOnly],
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

                const successfullyDeleted = new Set(
                    ids.filter((id) => !notDeleted.has(getChatIdString(id))),
                );
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of successfullyDeleted) {
                        next.delete(id);
                    }
                    return next;
                });

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

    const handleExportSelected = async () => {
        try {
            const byId = new Map(
                allChats.map((c) => [getChatIdString(c._id), c]),
            );
            const selectedIdList = Array.from(selectedIds)
                .map((id) => getChatIdString(id))
                .filter(Boolean);
            if (selectedIdList.length === 0) return;

            const selectedResults = await Promise.all(
                selectedIdList.map(async (id) => {
                    let chat =
                        byId.get(id) || queryClient.getQueryData(["chat", id]);
                    const needsFull =
                        !chat ||
                        !Array.isArray(chat?.messages) ||
                        chat?.messagesTruncated;
                    if (needsFull && isValidObjectId(id)) {
                        try {
                            const response = await axios.get(
                                `/api/chats/${String(id)}`,
                            );
                            chat = response.data;
                            if (chat) {
                                queryClient.setQueryData(["chat", id], chat);
                            }
                        } catch (error) {
                            return { id, chat: null };
                        }
                    }
                    if (
                        !chat ||
                        !Array.isArray(chat?.messages) ||
                        chat?.messagesTruncated
                    ) {
                        return { id, chat: null };
                    }
                    return { id, chat };
                }),
            );

            const missingIds = selectedResults
                .filter((result) => !result.chat)
                .map((result) => result.id);
            if (missingIds.length > 0) {
                const preview = summarizeItems(missingIds);
                showNotice(
                    t("Export failed"),
                    preview
                        ? `${t("Unable to load chats")}: ${preview}`
                        : t("Unable to load chats"),
                );
                return;
            }

            const selected = selectedResults
                .map((result) => result.chat)
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
    const { data: totalChatCount } = useTotalChatCount({
        enabled: shouldFetchTotalCount,
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        let cancelled = false;

        const enableFetch = () => {
            if (!cancelled) {
                setShouldFetchTotalCount(true);
            }
        };

        if ("requestIdleCallback" in window) {
            const idleId = window.requestIdleCallback(enableFetch, {
                timeout: 2000,
            });
            return () => {
                cancelled = true;
                if ("cancelIdleCallback" in window) {
                    window.cancelIdleCallback(idleId);
                }
            };
        }

        const timeoutId = setTimeout(enableFetch, 1500);
        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, []);

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

    const hasTruncatedMessages = useMemo(() => {
        if (!Array.isArray(data?.pages)) return false;
        return data.pages.some(
            (page) =>
                Array.isArray(page) &&
                page.some((chat) => chat?.messagesTruncated),
        );
    }, [data]);

    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = null;
        }

        if (hasTruncatedMessages) {
            setContentMatches((prev) => (prev.length ? [] : prev));
            setSearchError((prev) => (prev ? null : prev));
            return;
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

                const clientTerms = parseSearchQuery(searchQuery);
                const matches = [];
                for (const chat of chatsToSearch) {
                    if (!chat.messages?.length) continue;
                    const hasMatch =
                        clientTerms.length > 0 &&
                        chat.messages.some((message) => {
                            const text = extractSearchableText(
                                message?.payload,
                            );
                            return text
                                ? matchesAllTerms(text, clientTerms)
                                : false;
                        });
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
        hasTruncatedMessages,
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

    useEffect(() => {
        const container = chatsContainerRef.current;
        if (!container) return;
        let frame = null;

        // Find the real scroll ancestor — the container itself may have
        // overflow-y set but no height constraint, so it never scrolls.
        let scrollParent = null;
        let node = container.parentElement;
        while (node && node !== document.documentElement) {
            const style = getComputedStyle(node);
            if (
                /(auto|scroll)/.test(style.overflow + style.overflowY) &&
                node.scrollHeight > node.clientHeight + 1
            ) {
                scrollParent = node;
                break;
            }
            node = node.parentElement;
        }

        const scrollEl = scrollParent || container;

        const updateMetrics = () => {
            const rect = container.getBoundingClientRect();

            let scrollTop;
            let height;

            if (scrollParent) {
                const spRect = scrollParent.getBoundingClientRect();
                // How far the container top has scrolled above the scroll
                // parent's visible top edge — this is the virtual offset.
                scrollTop = Math.max(0, spRect.top - rect.top);
                height = scrollParent.clientHeight;
            } else {
                const hasScroll =
                    container.scrollHeight > container.clientHeight + 2;
                const absoluteTop = rect.top + window.scrollY;
                scrollTop = hasScroll
                    ? container.scrollTop
                    : Math.max(0, window.scrollY - absoluteTop);
                height = hasScroll
                    ? container.clientHeight
                    : window.innerHeight;
            }

            setVirtualScrollTop(scrollTop);
            setVirtualContainerSize({
                width: rect.width,
                height,
            });
        };

        const scheduleUpdate = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(updateMetrics);
        };

        const handleScroll = () => scheduleUpdate();
        const handleResize = () => scheduleUpdate();

        scrollEl.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleResize);

        let observer;
        if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(scheduleUpdate);
            observer.observe(container);
        }

        scheduleUpdate();

        return () => {
            if (frame) cancelAnimationFrame(frame);
            scrollEl.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleResize);
            if (observer) observer.disconnect();
        };
    }, []);

    const VIRTUAL_LIST_ROW_HEIGHT = 52; // px per list item (py-2 + content)

    const gridMetrics = useMemo(() => {
        const width = virtualContainerSize.width;
        if (isGridView) {
            const availableWidth = Math.max(width || GRID_MIN_CARD_WIDTH_PX, 1);
            const columns = Math.max(
                1,
                Math.floor(availableWidth / GRID_MIN_CARD_WIDTH_PX),
            );

            return {
                columns,
                rowHeight: GRID_CARD_HEIGHT_PX,
            };
        }

        return {
            columns: 1,
            rowHeight: VIRTUAL_LIST_ROW_HEIGHT,
        };
    }, [isGridView, virtualContainerSize.width]);

    const totalCategorizedChats = useMemo(
        () =>
            Object.values(categorizedChats).reduce(
                (sum, chats) => sum + chats.length,
                0,
            ),
        [categorizedChats],
    );

    const shouldVirtualize =
        !searchQuery &&
        totalCategorizedChats > VIRTUALIZE_THRESHOLD &&
        gridMetrics.rowHeight > 0;

    const buildUniqueChats = useCallback((chats) => {
        const uniqueChats = [];
        const seenIds = new Set();

        for (const chat of chats) {
            if (!chat) continue;
            const id = getChatIdString(chat._id);
            if (!id || seenIds.has(id)) continue;
            seenIds.add(id);
            uniqueChats.push(chat);
        }

        return uniqueChats;
    }, []);

    const getCategoryTitle = useCallback(
        (key, count) => `${getCategoryTranslation(key, t)} (${count})`,
        [t],
    );

    const virtualRows = useMemo(() => {
        if (!shouldVirtualize) return [];

        const rows = [];
        const categoryOrder = [
            "today",
            "yesterday",
            "thisWeek",
            "thisMonth",
            "older",
        ];

        for (const category of categoryOrder) {
            const chats = categorizedChats[category] || [];
            if (chats.length === 0) continue;
            const uniqueChats = buildUniqueChats(chats);
            rows.push({
                type: "header",
                key: `header-${category}`,
                title: getCategoryTitle(category, uniqueChats.length),
                height: VIRTUAL_HEADER_HEIGHT_PX,
                uniqueChats,
            });

            for (let i = 0; i < uniqueChats.length; i += gridMetrics.columns) {
                rows.push({
                    type: "row",
                    key: `${category}-${i}`,
                    chats: uniqueChats.slice(i, i + gridMetrics.columns),
                    height: gridMetrics.rowHeight,
                    uniqueChats,
                });
            }
        }

        return rows;
    }, [
        buildUniqueChats,
        categorizedChats,
        getCategoryTitle,
        gridMetrics.columns,
        gridMetrics.rowHeight,
        shouldVirtualize,
    ]);

    const handleCreateNewChat = useCallback(() => {
        if (isCreatingNewChat) return;
        setIsCreatingNewChat(true);
        startNewChat({ pathname, router, dispatch });
        setIsCreatingNewChat(false);
    }, [isCreatingNewChat, pathname, router, dispatch]);

    const handleDelete = async (chatId) => {
        try {
            if (isBulkProcessing) return;
            if (!chatId) return;
            if (
                params?.id &&
                String(params.id) === String(chatId) &&
                pathname?.startsWith("/chat")
            ) {
                const activeChats =
                    queryClient.getQueryData(["activeChats"]) || [];
                const userChatInfo =
                    queryClient.getQueryData(["userChatInfo"]) || {};

                const remainingActive = Array.isArray(activeChats)
                    ? activeChats.filter((chat) => chat?._id !== chatId)
                    : [];
                const fallbackRecent = Array.isArray(userChatInfo.recentChatIds)
                    ? userChatInfo.recentChatIds.filter((id) => id !== chatId)
                    : [];
                const nextActiveId =
                    remainingActive[0]?._id || fallbackRecent[0] || null;

                if (nextActiveId) {
                    router.push(`/chat/${nextActiveId}`);
                } else {
                    router.push("/chat");
                }
            }
            deleteChat.mutate({ chatId });
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

            // Navigate immediately - active chat ID will be updated
            // asynchronously in the background by Chat.js component
            router.push(`/chat/${chatId}`);
        } catch (error) {
            console.error("Failed to navigate:", error, chat);
        }
    };

    const renderChatTile = (chat, uniqueChats) => {
        if (!chat || !chat._id || !isValidObjectId(chat._id)) {
            return null;
        }

        const chatId = getChatIdString(chat._id);
        const isSelected = selectedIds.has(chatId);
        const previewText =
            chat?.lastMessagePreview || (chat?.isUnused ? t("Empty chat") : "");
        const timeLabel = chat?.createdAt
            ? dayjs(chat.createdAt).fromNow()
            : "";

        return (
            <div
                key={chat._id}
                data-testid="saved-chat-item"
                data-chat-id={chatId}
                className={`group rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors ${
                    isGridView
                        ? "relative flex min-h-[9.75rem] flex-col p-3"
                        : "flex items-center gap-3 px-3 py-2"
                }`}
                onClick={(e) => handleChatClick(chat, e)}
            >
                <div
                    data-testid="saved-chat-select"
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors select-none ${
                        isGridView ? "absolute start-3 top-3" : "flex-shrink-0"
                    } ${
                        isSelected
                            ? "bg-sky-500 border-sky-500"
                            : "border-gray-300 dark:border-gray-600 hover:border-sky-400"
                    }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        const chatIdStr = getChatIdString(chat._id);
                        if (e.shiftKey && lastSelectedId) {
                            const lastIndex = uniqueChats.findIndex(
                                (c) =>
                                    getChatIdString(c._id) === lastSelectedId,
                            );
                            const currentIndex = uniqueChats.findIndex(
                                (c) => getChatIdString(c._id) === chatIdStr,
                            );
                            if (lastIndex !== -1 && currentIndex !== -1) {
                                const start = Math.min(lastIndex, currentIndex);
                                const end = Math.max(lastIndex, currentIndex);
                                selectRangeHook(uniqueChats, start, end);
                            }
                        } else {
                            toggleSelection(chat);
                        }
                    }}
                >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>

                <div
                    className={
                        isGridView
                            ? "flex min-w-0 flex-1 flex-col ps-8 pe-8"
                            : "flex-1 min-w-0"
                    }
                >
                    <div
                        className={`flex items-center gap-2 ${
                            isGridView ? "min-h-5" : "h-5"
                        }`}
                    >
                        {editingId === chat._id ? (
                            <input
                                autoFocus
                                type="text"
                                className="font-medium text-sm leading-5 h-5 p-0 m-0 bg-transparent border-0 ring-0 focus:ring-0 outline-none text-gray-900 dark:text-gray-100 truncate flex-1 min-w-0 w-full"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                onBlur={() => handleSaveEdit(chat)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveEdit(chat);
                                    if (e.key === "Escape") setEditingId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <>
                                <span
                                    className="font-medium text-sm leading-5 text-gray-900 dark:text-gray-100 truncate cursor-text hover:text-sky-500 dark:hover:text-sky-400"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingId(chat._id);
                                        setEditedName(chat.title);
                                    }}
                                >
                                    {t(chat.title) || t("New Chat")}
                                </span>
                                {chat.isPublic && (
                                    <Users className="w-3 h-3 text-sky-500 flex-shrink-0" />
                                )}
                            </>
                        )}
                    </div>
                    {isGridView ? (
                        <>
                            <div
                                className="pointer-events-none mt-2 max-h-[3.75rem] overflow-hidden text-xs leading-5 text-gray-500 dark:text-gray-400"
                                style={{
                                    maskImage:
                                        "linear-gradient(to bottom, black 70%, transparent 100%)",
                                }}
                            >
                                <ChatPreviewMarkdown
                                    previewText={previewText}
                                />
                            </div>
                            <div className="mt-auto pt-3 text-xs text-gray-500 dark:text-gray-400">
                                {timeLabel}
                            </div>
                        </>
                    ) : (
                        <div className="flex min-w-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            {previewText && (
                                <div
                                    className="pointer-events-none min-w-0 flex-1 overflow-hidden"
                                    style={{
                                        maxHeight: "1.25rem",
                                        whiteSpace: "nowrap",
                                        maskImage:
                                            "linear-gradient(to right, black 90%, transparent 100%)",
                                    }}
                                >
                                    <ChatPreviewMarkdown
                                        previewText={previewText}
                                    />
                                </div>
                            )}
                            {chat?.lastMessagePreview && (
                                <span className="flex-shrink-0">·</span>
                            )}
                            <span className="flex-shrink-0">{timeLabel}</span>
                        </div>
                    )}
                </div>

                <div
                    className={`flex items-center gap-1 transition-opacity ${
                        isGridView
                            ? "absolute end-3 top-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                            : "flex-shrink-0 opacity-0 group-hover:opacity-100"
                    }`}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(chat._id);
                            setEditedName(chat.title);
                        }}
                        className="p-1 text-gray-400 hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
                        title={t("Edit title")}
                    >
                        <EditIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                        data-testid="saved-chat-delete"
                        onClick={(e) => {
                            e.stopPropagation();
                            setDeleteChatId(chat._id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title={t("Delete")}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        );
    };

    const renderChatElements = (chats) => {
        const uniqueChats = buildUniqueChats(chats);

        return (
            <div
                className={isGridView ? "grid gap-3" : "flex flex-col gap-1"}
                style={
                    isGridView
                        ? {
                              gridTemplateColumns:
                                  "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))",
                          }
                        : undefined
                }
            >
                {uniqueChats.map((chat) => renderChatTile(chat, uniqueChats))}
            </div>
        );
    };

    const renderVirtualizedCategories = () => {
        if (!shouldVirtualize) return null;

        const totalHeight =
            virtualRows.reduce((sum, row) => sum + row.height, 0) +
            Math.max(0, virtualRows.length - 1) * VIRTUAL_ROW_GAP_PX;
        const overscan =
            VIRTUAL_OVERSCAN_ROWS *
            (gridMetrics.rowHeight + VIRTUAL_ROW_GAP_PX);
        const startOffset = Math.max(0, virtualScrollTop - overscan);
        const endOffset =
            virtualScrollTop + virtualContainerSize.height + overscan;

        let offset = 0;
        const visibleRows = [];

        for (const row of virtualRows) {
            const rowHeight = row.height;
            const rowEnd = offset + rowHeight;
            if (rowEnd >= startOffset && offset <= endOffset) {
                visibleRows.push({ ...row, top: offset });
            }
            offset += rowHeight + VIRTUAL_ROW_GAP_PX;
        }

        return (
            <div style={{ height: totalHeight, position: "relative" }}>
                {visibleRows.map((row) =>
                    row.type === "header" ? (
                        <div
                            key={row.key}
                            style={{
                                position: "absolute",
                                top: row.top,
                                left: 0,
                                right: 0,
                                height: row.height,
                                display: "flex",
                                alignItems: "flex-end",
                            }}
                        >
                            <h2 className="text-md font-semibold border-b border-gray-200 dark:border-gray-700 pb-1 w-full">
                                {row.title}
                            </h2>
                        </div>
                    ) : (
                        <div
                            key={row.key}
                            style={{
                                position: "absolute",
                                top: row.top,
                                left: 0,
                                right: 0,
                                height: row.height,
                                ...(isGridView
                                    ? {
                                          display: "grid",
                                          gap: `${VIRTUAL_ROW_GAP_PX}px`,
                                          gridTemplateColumns: `repeat(${gridMetrics.columns}, minmax(0, 1fr))`,
                                      }
                                    : {}),
                            }}
                        >
                            {row.chats.map((chat) =>
                                renderChatTile(chat, row.uniqueChats),
                            )}
                        </div>
                    ),
                )}
            </div>
        );
    };

    // Infinite scroll with additional condition: don't load if bulk processing
    const { ref } = useInfiniteScroll({
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        additionalConditions: [!isBulkProcessing],
        rootRef: chatsContainerRef,
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
            return chatIdStr && !titleMatchIds.has(chatIdStr);
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
            return filterSharedChats(allChats);
        }
        return Array.isArray(allChats) ? allChats : [];
    }, [
        searchQuery,
        filteredSearchResults,
        contentMatchesDisplay,
        allChats,
        showSharedOnly,
        filterSharedChats,
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

    const resolvedTotalChatCount = useMemo(
        () =>
            typeof totalChatCount === "number"
                ? totalChatCount
                : visibleChats.length,
        [totalChatCount, visibleChats.length],
    );

    // Calculate the count of visible chats for display
    const visibleChatCount = useMemo(() => {
        if (searchQuery || showSharedOnly) {
            return visibleChats.length;
        }
        return resolvedTotalChatCount;
    }, [
        searchQuery,
        showSharedOnly,
        visibleChats.length,
        resolvedTotalChatCount,
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
                                                className="ml-2 text-xs text-sky-600 dark:text-sky-400 hover:underline"
                                            >
                                                {t("Show all")}
                                            </button>
                                        )}
                                    </>
                                )}
                                {` ${t("of")} ${resolvedTotalChatCount} ${t("total")}`}
                                {statusLabel && (
                                    <>
                                        <span className="mx-1 text-gray-400 dark:text-gray-500">
                                            •
                                        </span>
                                        <span className="text-sky-500 dark:text-sky-400">
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
                    {/* Filter Search Control with Shared Chats Toggle */}
                    <div className="flex items-center gap-2 w-full sm:flex-1 sm:max-w-lg">
                        <FilterInput
                            dataTestId="saved-chats-search"
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
                            className="flex-1"
                        />
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className={`flex items-center justify-center w-9 h-9 rounded-md border transition-colors ${
                                            showSharedOnly
                                                ? "bg-sky-500 dark:bg-sky-600 text-white border-sky-600 dark:border-sky-700 hover:bg-sky-600 dark:hover:bg-sky-700"
                                                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
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
                        </TooltipProvider>
                    </div>

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
                            <div
                                className="inline-flex h-9 items-center rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 p-0.5"
                                role="group"
                                aria-label={t("Chat view")}
                            >
                                {CHAT_VIEW_OPTIONS.map(
                                    ({ mode, label, testId, Icon }) => {
                                        const isActive = chatViewMode === mode;

                                        return (
                                            <Tooltip key={mode}>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type="button"
                                                        data-testid={testId}
                                                        aria-label={t(label)}
                                                        aria-pressed={isActive}
                                                        className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
                                                            isActive
                                                                ? "bg-sky-500 text-white"
                                                                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                                                        }`}
                                                        onClick={() =>
                                                            handleChatViewModeChange(
                                                                mode,
                                                            )
                                                        }
                                                    >
                                                        <Icon className="h-4 w-4" />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {t(label)}
                                                </TooltipContent>
                                            </Tooltip>
                                        );
                                    },
                                )}
                            </div>

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
                                        data-testid="saved-chats-bulk-delete"
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
                                        className={`lb-primary inline-flex items-center justify-center h-9 w-9 p-0 ${
                                            isCreatingNewChat
                                                ? "opacity-70 cursor-wait"
                                                : ""
                                        }`}
                                        onClick={handleCreateNewChat}
                                        disabled={isCreatingNewChat}
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
            <div
                ref={chatsContainerRef}
                data-testid="saved-chats-container"
                className="chats overflow-y-auto"
            >
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
                    <div>
                        {(() => {
                            const hasAnyChats = Object.values(
                                categorizedChats,
                            ).some((chats) => chats.length > 0);

                            // Show empty state if shared filter is active and no shared chats
                            if (showSharedOnly && !hasAnyChats) {
                                return (
                                    <EmptyState
                                        icon={
                                            <Users className="w-16 h-16 mx-auto text-gray-400" />
                                        }
                                        title={t("No shared chats found")}
                                        description={t(
                                            "You don't have any shared chats yet. Share a chat to see it here.",
                                        )}
                                        action={() => setShowSharedOnly(false)}
                                        actionLabel={t("Show All Chats")}
                                    />
                                );
                            }

                            // Show empty state if no chats at all (and not filtering)
                            if (
                                !showSharedOnly &&
                                !hasAnyChats &&
                                !areChatsLoading
                            ) {
                                return (
                                    <EmptyState
                                        icon="💬"
                                        title={t("No chats yet")}
                                        description={t(
                                            "Start a new conversation to see your chat history here.",
                                        )}
                                        action={handleCreateNewChat}
                                        actionLabel={t("New Chat")}
                                    />
                                );
                            }

                            if (shouldVirtualize) {
                                return renderVirtualizedCategories();
                            }

                            // Render categorized chats
                            return (
                                <>
                                    {Object.entries(categorizedChats).map(
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
                                    )}
                                </>
                            );
                        })()}
                        {!searchQuery && hasNextPage && (
                            <div
                                ref={ref}
                                data-testid="saved-chats-load-more"
                                className="h-10 flex items-center justify-center"
                            >
                                {isFetchingNextPage && <Loader />}
                            </div>
                        )}
                    </div>
                )}
            </div>

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
                            data-testid="saved-chat-delete-confirm"
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
                            data-testid="saved-chats-bulk-delete-confirm"
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
