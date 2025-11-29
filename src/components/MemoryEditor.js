import { Modal } from "@/components/ui/modal";
import { useApolloClient, useQuery } from "@apollo/client";
import { useContext, useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
    Download,
    Upload,
    Plus,
    X,
    Edit2,
    CheckSquare,
    Square,
    Filter,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";
import { QUERIES } from "../graphql";
import { LanguageContext } from "../contexts/LanguageProvider";
import FilterInput from "./common/FilterInput";
import BulkActionsBar from "./common/BulkActionsBar";
import EmptyState from "./common/EmptyState";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import { useItemSelection } from "./images/hooks/useItemSelection";

// Parse all memory sections into a flat list with section field
const parseAllMemory = (parsedMemory) => {
    const allItems = [];
    const sections = [
        { key: "memorySelf", label: "Self" },
        { key: "memoryUser", label: "User" },
        { key: "memoryDirectives", label: "Directives" },
        { key: "memoryTopics", label: "Topics" },
    ];

    sections.forEach((section) => {
        const memoryString = parsedMemory[section.key] || "";
        if (!memoryString || !memoryString.trim()) return;

        const lines = memoryString.split("\n");
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            const parts = trimmed.split("|");
            if (parts.length >= 3) {
                allItems.push({
                    id: `${section.key}-${index}`,
                    section: section.key,
                    sectionLabel: section.label,
                    priority: parts[0].trim(),
                    timestamp: parts[1].trim(),
                    content: parts.slice(2).join("|").trim(),
                });
            }
        });
    });

    return allItems;
};

// Serialize items back to memory structure
const serializeMemory = (items) => {
    const sections = {
        memorySelf: [],
        memoryUser: [],
        memoryDirectives: [],
        memoryTopics: [],
    };

    items.forEach((item) => {
        const timestamp = item.timestamp || new Date().toISOString();
        sections[item.section].push(
            `${item.priority}|${timestamp}|${item.content}`,
        );
    });

    return {
        memorySelf: sections.memorySelf.join("\n"),
        memoryUser: sections.memoryUser.join("\n"),
        memoryDirectives: sections.memoryDirectives.join("\n"),
        memoryTopics: sections.memoryTopics.join("\n"),
        memoryVersion: items[0]?.memoryVersion || "",
    };
};

function MemoryItem({
    item,
    onEdit,
    onDelete,
    isEditing,
    onSaveEdit,
    onCancelEdit,
    isSelected,
    onToggleSelect,
    sections,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    const [editContent, setEditContent] = useState(item.content);
    const [editPriority, setEditPriority] = useState(item.priority);
    const [editSection, setEditSection] = useState(item.section);
    const textareaRef = useRef(null);

    useEffect(() => {
        if (isEditing) {
            setEditContent(item.content);
            setEditPriority(item.priority);
            setEditSection(item.section);
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    if (item.content) {
                        textareaRef.current.select();
                    }
                }
            }, 100);
        }
    }, [isEditing, item.id, item.content, item.priority, item.section]);

    const handleSave = () => {
        onSaveEdit(item.id, {
            content: editContent,
            priority: editPriority,
            section: editSection,
        });
    };

    if (isEditing) {
        return (
            <div
                data-item-id={item.id}
                className="bg-white dark:bg-gray-800 border-2 border-sky-500 rounded p-1.5 mb-1"
                dir={direction}
            >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                    <div>
                        <label
                            className={`block text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5 ${isRTL ? "text-right" : "text-left"}`}
                        >
                            {t("Section")}
                        </label>
                        <select
                            value={editSection}
                            onChange={(e) => setEditSection(e.target.value)}
                            className="lb-input w-full text-xs"
                            dir={direction}
                        >
                            {sections.map((s) => (
                                <option key={s.key} value={s.key}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label
                            className={`block text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5 ${isRTL ? "text-right" : "text-left"}`}
                        >
                            {t("Priority")}
                        </label>
                        <input
                            type="text"
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value)}
                            className="lb-input w-full text-xs"
                            placeholder="1"
                            dir={direction}
                        />
                    </div>
                </div>
                <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="lb-input font-mono w-full text-xs mb-1.5 resize-none"
                    rows={2}
                    dir={direction}
                />
                <div
                    className={`flex gap-1.5 ${isRTL ? "flex-row-reverse" : ""}`}
                >
                    <button
                        onClick={handleSave}
                        className="lb-primary text-[10px] px-1.5 py-0.5"
                    >
                        {t("Save")}
                    </button>
                    <button
                        onClick={() => {
                            setEditContent(item.content);
                            setEditPriority(item.priority);
                            setEditSection(item.section);
                            onCancelEdit();
                        }}
                        className="lb-outline-secondary text-[10px] px-1.5 py-0.5"
                    >
                        {t("Cancel")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            data-item-id={item.id}
            className={`bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded p-1.5 mb-1 ${
                isSelected ? "ring-1 ring-sky-500" : ""
            }`}
            dir={direction}
        >
            <div
                className={`flex items-start gap-1.5 ${isRTL ? "flex-row-reverse" : ""}`}
            >
                {isRTL ? (
                    <>
                        <div className="flex gap-0.5 flex-shrink-0">
                            <button
                                onClick={() => onEdit(item.id)}
                                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                title={t("Edit")}
                            >
                                <Edit2 className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                            </button>
                            <button
                                onClick={() => onDelete(item.id)}
                                className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                title={t("Delete")}
                            >
                                <X className="h-3 w-3 text-red-600 dark:text-red-400" />
                            </button>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words mb-1">
                                {item.content}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 flex-row-reverse">
                                <span className="font-mono">
                                    {new Date(item.timestamp).toLocaleString()}
                                </span>
                                <span className="font-mono bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">
                                    {item.priority}
                                </span>
                                <span className="font-medium">
                                    {item.sectionLabel}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => onToggleSelect(item)}
                            className="flex-shrink-0 mt-0.5"
                        >
                            {isSelected ? (
                                <CheckSquare className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                            ) : (
                                <Square className="h-3 w-3 text-gray-400" />
                            )}
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={() => onToggleSelect(item)}
                            className="flex-shrink-0 mt-0.5"
                        >
                            {isSelected ? (
                                <CheckSquare className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                            ) : (
                                <Square className="h-3 w-3 text-gray-400" />
                            )}
                        </button>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words mb-1">
                                {item.content}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                                <span className="font-medium">
                                    {item.sectionLabel}
                                </span>
                                <span className="font-mono bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">
                                    {item.priority}
                                </span>
                                <span className="font-mono">
                                    {new Date(item.timestamp).toLocaleString()}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-0.5 flex-shrink-0">
                            <button
                                onClick={() => onEdit(item.id)}
                                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                title={t("Edit")}
                            >
                                <Edit2 className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                            </button>
                            <button
                                onClick={() => onDelete(item.id)}
                                className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                title={t("Delete")}
                            >
                                <X className="h-3 w-3 text-red-600 dark:text-red-400" />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// Export the content component so it can be used without the Modal wrapper
export const MemoryEditorContent = ({ user, aiName, onClose }) => {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    const fileInputRef = useRef();
    const apolloClient = useApolloClient();
    const containerRef = useRef(null);

    const [items, setItems] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("timestamp");
    const [sortOrder, setSortOrder] = useState("desc");
    const [sectionFilter, setSectionFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [error, setError] = useState("");
    const [isParseable, setIsParseable] = useState(true);
    const [rawMemory, setRawMemory] = useState("");
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [saving, setSaving] = useState(false);

    // Use the common selection hook
    const { selectedIds, toggleSelection, clearSelection, setSelectedIds } =
        useItemSelection((item) => item.id);

    const sections = [
        { key: "memorySelf", label: t("Self Memory") },
        { key: "memoryUser", label: t("User Memory") },
        { key: "memoryDirectives", label: t("Directives") },
        { key: "memoryTopics", label: t("Topics") },
    ];

    const {
        data: memoryData,
        loading: memoryLoading,
        refetch: refetchMemory,
    } = useQuery(QUERIES.SYS_READ_MEMORY, {
        variables: { contextId: user?.contextId, contextKey: user?.contextKey },
        skip: !user?.contextId,
        fetchPolicy: "network-only",
    });

    useEffect(() => {
        if (user?.contextId) {
            refetchMemory();
            setSaving(false);
        }
    }, [user?.contextId, refetchMemory]);

    useEffect(() => {
        if (memoryData?.sys_read_memory?.result) {
            const memoryString = memoryData.sys_read_memory.result.trim();

            // Empty memory should be parseable
            if (!memoryString) {
                setItems([]);
                setIsParseable(true);
                setRawMemory("");
                return;
            }

            try {
                const parsed = JSON.parse(memoryString);
                const allItems = parseAllMemory(parsed);
                if (allItems.length > 0) {
                    setItems(allItems);
                    setIsParseable(true);
                    setRawMemory("");
                } else {
                    // If parsed but no items, check if it's valid structure
                    // Check if the object has the expected memory keys (even if empty)
                    const hasValidStructure =
                        typeof parsed === "object" &&
                        parsed !== null &&
                        ("memorySelf" in parsed ||
                            "memoryUser" in parsed ||
                            "memoryDirectives" in parsed ||
                            "memoryTopics" in parsed);
                    if (hasValidStructure) {
                        // Valid structure but empty items - still parseable
                        setItems([]);
                        setIsParseable(true);
                        setRawMemory("");
                    } else {
                        // Not in expected format - show as raw text
                        setItems([]);
                        setIsParseable(false);
                        setRawMemory(memoryString);
                    }
                }
            } catch (e) {
                // Failed to parse JSON - show as raw text
                setItems([]);
                setIsParseable(false);
                setRawMemory(memoryString);
            }
        } else {
            setItems([]);
            setIsParseable(true);
            setRawMemory("");
        }
    }, [memoryData]);

    const filteredItems = useMemo(() => {
        let filtered = [...items];

        // Filter by search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter((item) =>
                item.content.toLowerCase().includes(query),
            );
        }

        // Filter by section
        if (sectionFilter !== "all") {
            filtered = filtered.filter(
                (item) => item.section === sectionFilter,
            );
        }

        // Filter by priority
        if (priorityFilter !== "all") {
            filtered = filtered.filter(
                (item) => item.priority === priorityFilter,
            );
        }

        // Sort
        filtered.sort((a, b) => {
            let comparison = 0;
            if (sortBy === "timestamp") {
                comparison = new Date(a.timestamp) - new Date(b.timestamp);
            } else if (sortBy === "priority") {
                comparison = parseInt(a.priority) - parseInt(b.priority);
            } else if (sortBy === "content") {
                comparison = a.content.localeCompare(b.content);
            } else if (sortBy === "section") {
                comparison = a.sectionLabel.localeCompare(b.sectionLabel);
            }
            return sortOrder === "asc" ? comparison : -comparison;
        });

        return filtered;
    }, [items, searchQuery, sectionFilter, priorityFilter, sortBy, sortOrder]);

    const uniquePriorities = useMemo(
        () =>
            [...new Set(items.map((item) => item.priority))].sort(
                (a, b) => parseInt(a) - parseInt(b),
            ),
        [items],
    );

    const allSelected = useMemo(
        () =>
            filteredItems.length > 0 &&
            filteredItems.every((item) => selectedIds.has(item.id)),
        [filteredItems, selectedIds],
    );

    const handleAddItem = () => {
        const newItem = {
            id: `item-${Date.now()}-${Math.random()}`,
            section: "memoryUser",
            sectionLabel: t("User Memory"),
            priority: "1",
            timestamp: new Date().toISOString(),
            content: "",
        };
        const newItems = [...items, newItem];
        setItems(newItems);
        setSearchQuery("");
        setSectionFilter("all");
        setPriorityFilter("all");
        setEditingId(newItem.id);
        // Scroll to new item after a brief delay
        setTimeout(() => {
            const element = document.querySelector(
                `[data-item-id="${newItem.id}"]`,
            );
            if (element) {
                element.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 150);
    };

    const handleEdit = (id) => {
        setEditingId(id);
    };

    const handleSaveEdit = (id, updates) => {
        const updated = items.map((item) => {
            if (item.id === id) {
                return {
                    ...item,
                    ...updates,
                    timestamp: new Date().toISOString(), // Auto-update timestamp on save
                    sectionLabel:
                        sections.find((s) => s.key === updates.section)
                            ?.label || item.sectionLabel,
                };
            }
            return item;
        });
        setItems(updated);
        setEditingId(null);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
    };

    const handleDelete = (id) => {
        const filtered = items.filter((item) => item.id !== id);
        setItems(filtered);
        const itemToRemove = items.find((item) => item.id === id);
        if (itemToRemove && selectedIds.has(id)) {
            toggleSelection(itemToRemove);
        }
    };

    const handleDeleteSelected = () => {
        const filtered = items.filter((item) => !selectedIds.has(item.id));
        setItems(filtered);
        clearSelection();
    };

    const handleToggleSelect = (item) => {
        toggleSelection(item);
    };

    const handleSelectAll = () => {
        if (allSelected) {
            clearSelection();
        } else {
            setSelectedIds(new Set(filteredItems.map((item) => item.id)));
        }
    };

    const handleClear = () => {
        setShowClearConfirm(true);
    };

    const handleConfirmClear = () => {
        setItems([]);
        clearSelection();
        setError("");
        setShowClearConfirm(false);
    };

    const handleSave = async () => {
        if (!user?.contextId) {
            setError(t("User context not found"));
            return;
        }

        setSaving(true);
        setError("");

        try {
            let combinedMemory;
            if (isParseable) {
                const serialized = serializeMemory(items);
                combinedMemory = JSON.stringify(serialized);
            } else {
                // Save raw memory as-is
                combinedMemory = rawMemory;
            }
            await apolloClient.mutate({
                mutation: QUERIES.SYS_SAVE_MEMORY,
                variables: {
                    contextId: user.contextId,
                    contextKey: user.contextKey,
                    aiMemory: combinedMemory,
                },
            });
            onClose();
        } catch (error) {
            console.error("Failed to save memory:", error);
            setError(
                error.message || t("Failed to save memory. Please try again."),
            );
            setSaving(false);
        }
    };

    const handleDownload = () => {
        const serialized = serializeMemory(items);
        const blob = new Blob([JSON.stringify(serialized, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const now = new Date();
        const date = now.toISOString().split("T")[0];
        const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
        a.download = `${(aiName || "labeeb").toLowerCase()}-memory-${date}-${time}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleUpload = (event) => {
        const file = event.target.files[0];
        setError("");
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const uploaded = JSON.parse(e.target.result);
                    if (!uploaded || typeof uploaded !== "object") {
                        throw new Error(t("Invalid memory file format"));
                    }
                    const allItems = parseAllMemory(uploaded);
                    setItems(allItems);
                } catch (error) {
                    console.error("Failed to parse memory file:", error);
                    setError(
                        t(
                            "Failed to parse memory file. Please ensure it is a valid JSON file with the correct memory structure.",
                        ),
                    );
                    if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                    }
                }
            };
            reader.onerror = () => {
                setError(t("Failed to read the file. Please try again."));
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            };
            reader.readAsText(file);
        }
    };

    const memorySize = JSON.stringify(serializeMemory(items)).length;

    // Helper to clear all filters
    const clearAllFilters = () => {
        setSearchQuery("");
        setSectionFilter("all");
        setPriorityFilter("all");
    };

    const hasActiveFilters =
        searchQuery || sectionFilter !== "all" || priorityFilter !== "all";

    // Common button classes
    const actionButtonClass =
        "flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors";
    const clearButtonClass =
        "flex items-center justify-center w-9 h-9 rounded-md border border-red-300 dark:border-red-600 bg-white dark:bg-gray-700 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors";

    // Sort options for Select dropdown
    const sortOptions = [
        { value: "timestamp", label: t("Timestamp") },
        { value: "section", label: t("Section") },
        { value: "priority", label: t("Priority") },
        { value: "content", label: t("Content") },
    ];

    return (
        <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px]">
            {error && (
                <div
                    className={`text-red-500 text-xs p-2 bg-red-50 dark:bg-red-900/20 rounded mb-3 ${isRTL ? "text-right" : "text-left"}`}
                    dir={direction}
                >
                    {error}
                </div>
            )}

            {memoryLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("Loading memory...")}
                    </p>
                </div>
            ) : (
                <>
                    {/* Filter and Action Controls */}
                    <div
                        className={`flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4 ${isRTL ? "items-end sm:items-center" : ""}`}
                    >
                        {/* Search - Full Width */}
                        {isParseable && (
                            <div className="w-full sm:flex-1 sm:max-w-lg">
                                <FilterInput
                                    value={searchQuery}
                                    onChange={setSearchQuery}
                                    onClear={() => setSearchQuery("")}
                                    placeholder={t("Search content...")}
                                    className="w-full"
                                />
                            </div>
                        )}

                        {/* Action Buttons and Size - Left on mobile, Right on desktop */}
                        <div
                            className={`flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto ${isRTL ? "ml-auto sm:ml-0" : "justify-start sm:justify-end"}`}
                        >
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            className={actionButtonClass}
                                            onClick={handleAddItem}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Add Item")}
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            className={actionButtonClass}
                                            onClick={handleDownload}
                                        >
                                            <Download className="h-4 w-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Download memory backup")}
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            className={actionButtonClass}
                                            onClick={() =>
                                                fileInputRef.current?.click()
                                            }
                                        >
                                            <Upload className="h-4 w-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Upload memory from backup")}
                                    </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            className={clearButtonClass}
                                            onClick={handleClear}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Clear All")}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <div
                                className={`text-sm text-gray-500 dark:text-gray-400 order-last sm:order-first ${isRTL ? "ms-2" : "me-2"}`}
                            >
                                {t("Size: {{size}} characters", {
                                    size: memorySize,
                                })}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleUpload}
                                className="hidden"
                            />
                        </div>
                    </div>

                    {/* Clear All Confirmation Dialog */}
                    <AlertDialog
                        open={showClearConfirm}
                        onOpenChange={setShowClearConfirm}
                    >
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    {t("Clear All Memory?")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    {t(
                                        "Are you sure you want to clear all memory items? This action cannot be undone.",
                                    )}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter
                                className={
                                    isRTL
                                        ? "flex-row-reverse sm:flex-row-reverse"
                                        : ""
                                }
                            >
                                <AlertDialogCancel>
                                    {t("Cancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleConfirmClear}
                                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                                >
                                    {t("Clear All")}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {/* Bulk Actions Bar */}
                    {selectedIds.size > 0 && (
                        <BulkActionsBar
                            selectedCount={selectedIds.size}
                            allSelected={allSelected}
                            onSelectAll={handleSelectAll}
                            onClearSelection={clearSelection}
                            actions={{
                                delete: {
                                    onClick: handleDeleteSelected,
                                    label: t("Delete Selected"),
                                    ariaLabel: t("Delete selected items"),
                                },
                            }}
                        />
                    )}

                    {/* Filters and Sort Controls - Under Search */}
                    {isParseable && (
                        <div
                            className={`flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-2 ${isRTL ? "sm:flex-row-reverse" : ""}`}
                        >
                            {/* Filters - Left Side in LTR, Right Side in RTL */}
                            <div
                                className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse justify-end sm:justify-end" : "justify-start"}`}
                            >
                                <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                <Select
                                    value={sectionFilter}
                                    onValueChange={setSectionFilter}
                                >
                                    <SelectTrigger
                                        className="w-[120px] h-8 text-xs"
                                        dir={direction}
                                    >
                                        <SelectValue
                                            placeholder={t("Section")}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            {t("All")}
                                        </SelectItem>
                                        {sections.map((s) => (
                                            <SelectItem
                                                key={s.key}
                                                value={s.key}
                                            >
                                                {s.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select
                                    value={priorityFilter}
                                    onValueChange={setPriorityFilter}
                                >
                                    <SelectTrigger
                                        className="w-[100px] h-8 text-xs"
                                        dir={direction}
                                    >
                                        <SelectValue
                                            placeholder={t("Priority")}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            {t("All")}
                                        </SelectItem>
                                        {uniquePriorities.map((p) => (
                                            <SelectItem key={p} value={p}>
                                                {p}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {hasActiveFilters && (
                                    <button
                                        onClick={clearAllFilters}
                                        className="flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                                        title={t("Clear Filters")}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            {/* Sort - Right Side in LTR, Left Side in RTL */}
                            {filteredItems.length > 0 && (
                                <div
                                    className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse justify-end sm:justify-end" : "justify-start sm:justify-end"}`}
                                >
                                    <button
                                        onClick={() =>
                                            setSortOrder(
                                                sortOrder === "asc"
                                                    ? "desc"
                                                    : "asc",
                                            )
                                        }
                                        className="lb-outline-secondary text-xs px-2 py-1 h-8 min-w-[2rem]"
                                        title={t("Toggle sort order")}
                                    >
                                        {sortOrder === "asc" ? "↑" : "↓"}
                                    </button>
                                    <Select
                                        value={sortBy}
                                        onValueChange={setSortBy}
                                    >
                                        <SelectTrigger
                                            className="w-[140px] h-8 text-xs"
                                            dir={direction}
                                        >
                                            <SelectValue
                                                placeholder={t("Sort")}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {sortOptions.map((option) => (
                                                <SelectItem
                                                    key={option.value}
                                                    value={option.value}
                                                >
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Items List or Raw Text Editor */}
                    <div
                        className="flex-1 overflow-y-auto min-h-0"
                        ref={containerRef}
                    >
                        {!isParseable ? (
                            <div className="flex flex-col h-full">
                                <label
                                    className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 ${isRTL ? "text-right" : "text-left"}`}
                                    htmlFor="raw-memory-editor"
                                    dir={direction}
                                >
                                    {t("Memory (Raw Text Format)")}
                                    <span
                                        className={`${isRTL ? "ms-1.5" : "ms-1.5"} text-[10px] text-gray-500 dark:text-gray-400`}
                                    >
                                        (
                                        {t(
                                            "Not parseable as structured memory",
                                        )}
                                        )
                                    </span>
                                </label>
                                <textarea
                                    id="raw-memory-editor"
                                    value={rawMemory}
                                    onChange={(e) =>
                                        setRawMemory(e.target.value)
                                    }
                                    className="lb-input font-mono text-xs w-full flex-1 resize-none"
                                    placeholder={t(
                                        "Enter memory content. Use format: priority|timestamp|content (one per line) for structured editing, or plain text.",
                                    )}
                                    dir={direction}
                                />
                            </div>
                        ) : items.length === 0 ? (
                            <EmptyState
                                icon="🧠"
                                title={t("No memory items")}
                                description={t(
                                    "Click 'Add Item' to create your first memory item.",
                                )}
                                action={handleAddItem}
                                actionLabel={t("Add Item")}
                            />
                        ) : filteredItems.length === 0 ? (
                            <EmptyState
                                icon="🔍"
                                title={t("No items match your filters")}
                                description={t(
                                    "Try adjusting your search or filter criteria.",
                                )}
                            />
                        ) : (
                            <div>
                                {filteredItems.map((item) => (
                                    <MemoryItem
                                        key={item.id}
                                        item={item}
                                        onEdit={handleEdit}
                                        onDelete={handleDelete}
                                        isEditing={editingId === item.id}
                                        onSaveEdit={handleSaveEdit}
                                        onCancelEdit={handleCancelEdit}
                                        isSelected={selectedIds.has(item.id)}
                                        onToggleSelect={handleToggleSelect}
                                        sections={sections}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div
                        className={`flex gap-2 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 relative z-10 bg-white dark:bg-gray-800 ${isRTL ? "flex-row-reverse justify-start" : "justify-end"}`}
                    >
                        <button
                            className="lb-outline-secondary text-xs flex-1 sm:flex-initial"
                            onClick={onClose}
                            disabled={saving}
                        >
                            {t("Cancel")}
                        </button>
                        <button
                            className="lb-primary text-xs flex-1 sm:flex-initial flex items-center justify-center gap-2"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving && <Spinner size="sm" />}
                            {t("Save")}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

const MemoryEditor = ({ show, onClose, user, aiName }) => {
    const { t } = useTranslation();
    return (
        <Modal
            widthClassName="max-w-6xl"
            title={t("Memory Editor")}
            show={show}
            onHide={onClose}
        >
            <MemoryEditorContent
                user={user}
                aiName={aiName}
                onClose={onClose}
            />
        </Modal>
    );
};

export default MemoryEditor;
