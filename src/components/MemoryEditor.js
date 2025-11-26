import { Modal } from "@/components/ui/modal";
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useApolloClient, useQuery } from "@apollo/client";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Download,
    Upload,
    GripVertical,
    Plus,
    X,
    Edit2,
    Search,
    ArrowUpDown,
    Filter,
    CheckSquare,
    Square,
} from "lucide-react";
import { QUERIES } from "../graphql";
import { LanguageContext } from "../contexts/LanguageProvider";

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

function SortableMemoryItem({
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
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    const [editContent, setEditContent] = useState(item.content);
    const [editPriority, setEditPriority] = useState(item.priority);
    const [editSection, setEditSection] = useState(item.section);
    const textareaRef = useRef(null);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition: transition || "transform 200ms ease",
    };

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
    }, [isEditing, item.id]);

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
                className="bg-white dark:bg-gray-800 border-2 border-sky-500 rounded-lg p-3 mb-2"
                dir={direction}
            >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <div>
                        <label className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 ${isRTL ? "text-right" : "text-left"}`}>
                            {t("Section")}
                        </label>
                        <select
                            value={editSection}
                            onChange={(e) => setEditSection(e.target.value)}
                            className="lb-input w-full text-sm"
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
                        <label className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 ${isRTL ? "text-right" : "text-left"}`}>
                            {t("Priority")}
                        </label>
                        <input
                            type="text"
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value)}
                            className="lb-input w-full text-sm"
                            placeholder="1"
                            dir={direction}
                        />
                    </div>
                </div>
                <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="lb-input font-mono w-full text-sm mb-2 resize-none"
                    rows={3}
                    dir={direction}
                />
                <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <button onClick={handleSave} className="lb-primary text-xs px-2 py-1">
                        {t("Save")}
                    </button>
                    <button
                        onClick={() => {
                            setEditContent(item.content);
                            setEditPriority(item.priority);
                            setEditSection(item.section);
                            onCancelEdit();
                        }}
                        className="lb-outline-secondary text-xs px-2 py-1"
                    >
                        {t("Cancel")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-item-id={item.id}
            className={`bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 mb-2 ${
                isDragging ? "opacity-50 shadow-lg" : ""
            } ${isSelected ? "ring-2 ring-sky-500" : ""}`}
            dir={direction}
        >
            <div className="flex items-start gap-2">
                <button
                    onClick={() => onToggleSelect(item.id)}
                    className="flex-shrink-0 mt-0.5"
                >
                    {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    ) : (
                        <Square className="h-4 w-4 text-gray-400" />
                    )}
                </button>
                <button
                    {...attributes}
                    {...listeners}
                    className={`cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded flex-shrink-0 mt-0.5 ${isRTL ? "order-last" : ""}`}
                >
                    <GripVertical className="h-4 w-4 text-gray-400" />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words mb-1.5">
                        {item.content}
                    </div>
                    <div className={`flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 ${isRTL ? "flex-row-reverse" : ""}`}>
                        <span className="font-medium">{item.sectionLabel}</span>
                        <span className="font-mono bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded">
                            {item.priority}
                        </span>
                        <span className="font-mono">
                            {new Date(item.timestamp).toLocaleString()}
                        </span>
                    </div>
                </div>
                <div className={`flex gap-1 flex-shrink-0 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <button
                        onClick={() => onEdit(item.id)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                        title={t("Edit")}
                    >
                        <Edit2 className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />
                    </button>
                    <button
                        onClick={() => onDelete(item.id)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        title={t("Delete")}
                    >
                        <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    </button>
                </div>
            </div>
        </div>
    );
}

const MemoryEditor = ({ show, onClose, user, aiName }) => {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    const fileInputRef = useRef();
    const apolloClient = useApolloClient();

    const [items, setItems] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("timestamp");
    const [sortOrder, setSortOrder] = useState("desc");
    const [sectionFilter, setSectionFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [error, setError] = useState("");
    const [isParseable, setIsParseable] = useState(true);
    const [rawMemory, setRawMemory] = useState("");

    const sections = [
        { key: "memorySelf", label: t("Self Memory") },
        { key: "memoryUser", label: t("User Memory") },
        { key: "memoryDirectives", label: t("Directives") },
        { key: "memoryTopics", label: t("Topics") },
    ];

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const {
        data: memoryData,
        loading: memoryLoading,
        refetch: refetchMemory,
    } = useQuery(QUERIES.SYS_READ_MEMORY, {
        variables: { contextId: user?.contextId, contextKey: user?.contextKey },
        skip: !user?.contextId || !show,
        fetchPolicy: "network-only",
    });

    useEffect(() => {
        if (show && user?.contextId) {
            refetchMemory();
        }
    }, [show, user?.contextId, refetchMemory]);

    useEffect(() => {
        if (memoryData?.sys_read_memory?.result) {
            try {
                const parsed = JSON.parse(memoryData.sys_read_memory.result);
                const allItems = parseAllMemory(parsed);
                if (allItems.length > 0) {
                    setItems(allItems);
                    setIsParseable(true);
                    setRawMemory("");
                } else {
                    // If parsed but no items, check if it's valid structure
                    const hasAnyMemory = 
                        parsed.memorySelf || 
                        parsed.memoryUser || 
                        parsed.memoryDirectives || 
                        parsed.memoryTopics;
                    if (hasAnyMemory) {
                        // Valid structure but empty items - still parseable
                        setItems([]);
                        setIsParseable(true);
                        setRawMemory("");
                    } else {
                        // Not in expected format - show as raw text
                        setItems([]);
                        setIsParseable(false);
                        setRawMemory(memoryData.sys_read_memory.result);
                    }
                }
            } catch (e) {
                // Failed to parse JSON - show as raw text
                setItems([]);
                setIsParseable(false);
                setRawMemory(memoryData.sys_read_memory.result);
            }
        } else {
            setItems([]);
            setIsParseable(true);
            setRawMemory("");
        }
    }, [memoryData]);

    const getFilteredAndSortedItems = () => {
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
            filtered = filtered.filter((item) => item.section === sectionFilter);
        }

        // Filter by priority
        if (priorityFilter !== "all") {
            filtered = filtered.filter((item) => item.priority === priorityFilter);
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
    };

    const filteredItems = getFilteredAndSortedItems();
    const uniquePriorities = [...new Set(items.map((item) => item.priority))].sort(
        (a, b) => parseInt(a) - parseInt(b),
    );

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) {
            setActiveId(null);
            return;
        }

        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        setItems(newItems);
        setActiveId(null);
    };

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
        setTimeout(() => {
            const element = document.querySelector(`[data-item-id="${newItem.id}"]`);
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
                    sectionLabel: sections.find((s) => s.key === updates.section)?.label || item.sectionLabel,
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
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const handleDeleteSelected = () => {
        const filtered = items.filter((item) => !selectedIds.has(item.id));
        setItems(filtered);
        setSelectedIds(new Set());
    };

    const handleToggleSelect = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedIds.size === filteredItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredItems.map((item) => item.id)));
        }
    };

    const handleClear = () => {
        setItems([]);
        setSelectedIds(new Set());
        setError("");
    };

    const handleSave = async () => {
        if (!user?.contextId) {
            setError(t("User context not found"));
            return;
        }

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

    return (
        <Modal
            widthClassName="max-w-6xl"
            title={t("Memory Editor")}
            show={show}
            onHide={onClose}
        >
            <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px]">
                {error && (
                    <div
                        className={`text-red-500 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-md mb-4 ${isRTL ? "text-right" : "text-left"}`}
                        dir={direction}
                    >
                        {error}
                    </div>
                )}

                {memoryLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-gray-500 dark:text-gray-400">
                            {t("Loading memory...")}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="space-y-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                            <div
                                className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${isRTL ? "sm:flex-row-reverse" : ""}`}
                            >
                                <div
                                    className={`flex flex-wrap gap-2 items-center ${isRTL ? "flex-row-reverse" : ""}`}
                                >
                                    <button
                                        className="lb-outline-secondary text-sm"
                                        onClick={handleAddItem}
                                    >
                                        <Plus className={`w-4 h-4 inline ${isRTL ? "ms-1.5" : "me-1.5"}`} />
                                        {t("Add Item")}
                                    </button>
                                    {selectedIds.size > 0 && (
                                        <button
                                            className="lb-outline-danger text-sm"
                                            onClick={handleDeleteSelected}
                                        >
                                            <X className={`w-4 h-4 inline ${isRTL ? "ms-1.5" : "me-1.5"}`} />
                                            {t("Delete Selected")} ({selectedIds.size})
                                        </button>
                                    )}
                                    <button
                                        className="lb-outline-danger text-sm"
                                        onClick={handleClear}
                                    >
                                        {t("Clear All")}
                                    </button>
                                    <button
                                        className="lb-outline-secondary text-sm"
                                        onClick={handleDownload}
                                        title={t("Download memory backup")}
                                    >
                                        <Download className={`w-4 h-4 inline ${isRTL ? "ms-1.5" : "me-1.5"}`} />
                                        {t("Download")}
                                    </button>
                                    <button
                                        className="lb-outline-secondary text-sm"
                                        onClick={() => fileInputRef.current?.click()}
                                        title={t("Upload memory from backup")}
                                    >
                                        <Upload className={`w-4 h-4 inline ${isRTL ? "ms-1.5" : "me-1.5"}`} />
                                        {t("Upload")}
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".json"
                                        onChange={handleUpload}
                                        className="hidden"
                                    />
                                </div>
                                <div
                                    className={`text-sm text-gray-500 dark:text-gray-400 ${isRTL ? "text-right" : "text-left"}`}
                                >
                                    {t("Size: {{size}} characters", { size: memorySize })}
                                </div>
                            </div>

                            {/* Search and Filter Controls */}
                            {isParseable && items.length > 0 && (
                                <div
                                    className={`flex flex-col sm:flex-row gap-3 items-start sm:items-center ${isRTL ? "sm:flex-row-reverse" : ""}`}
                                >
                                    <div className="relative flex-1 min-w-0 max-w-md">
                                        <Search
                                            className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none ${isRTL ? "end-2" : "start-2"}`}
                                        />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder={t("Search content...")}
                                            className={`lb-input w-full text-sm ${isRTL ? "pe-8 ps-2" : "ps-9 pe-2"}`}
                                            dir={direction}
                                        />
                                    </div>
                                    <div
                                        className={`flex gap-2 items-center ${isRTL ? "flex-row-reverse" : ""}`}
                                    >
                                        <label
                                            className={`text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1 ${isRTL ? "flex-row-reverse" : ""}`}
                                        >
                                            <Filter className="h-3.5 w-3.5" />
                                            {t("Section:")}
                                        </label>
                                        <select
                                            value={sectionFilter}
                                            onChange={(e) => setSectionFilter(e.target.value)}
                                            className="lb-input text-sm py-1 px-2"
                                            dir={direction}
                                        >
                                            <option value="all">{t("All")}</option>
                                            {sections.map((s) => (
                                                <option key={s.key} value={s.key}>
                                                    {s.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div
                                        className={`flex gap-2 items-center ${isRTL ? "flex-row-reverse" : ""}`}
                                    >
                                        <label
                                            className={`text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1 ${isRTL ? "flex-row-reverse" : ""}`}
                                        >
                                            {t("Priority:")}
                                        </label>
                                        <select
                                            value={priorityFilter}
                                            onChange={(e) => setPriorityFilter(e.target.value)}
                                            className="lb-input text-sm py-1 px-2"
                                            dir={direction}
                                        >
                                            <option value="all">{t("All")}</option>
                                            {uniquePriorities.map((p) => (
                                                <option key={p} value={p}>
                                                    {p}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div
                                        className={`flex gap-2 items-center ${isRTL ? "flex-row-reverse" : ""}`}
                                    >
                                        <label
                                            className={`text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1 ${isRTL ? "flex-row-reverse" : ""}`}
                                        >
                                            <ArrowUpDown className="h-3.5 w-3.5" />
                                            {t("Sort:")}
                                        </label>
                                        <select
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value)}
                                            className="lb-input text-sm py-1 px-2"
                                            dir={direction}
                                        >
                                            <option value="timestamp">{t("Timestamp")}</option>
                                            <option value="section">{t("Section")}</option>
                                            <option value="priority">{t("Priority")}</option>
                                            <option value="content">{t("Content")}</option>
                                        </select>
                                        <button
                                            onClick={() =>
                                                setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                                            }
                                            className="lb-outline-secondary text-xs px-2 py-1"
                                            title={t("Toggle sort order")}
                                        >
                                            {sortOrder === "asc" ? "↑" : "↓"}
                                        </button>
                                    </div>
                                    {(searchQuery || sectionFilter !== "all" || priorityFilter !== "all") && (
                                        <button
                                            onClick={() => {
                                                setSearchQuery("");
                                                setSectionFilter("all");
                                                setPriorityFilter("all");
                                            }}
                                            className="lb-outline-secondary text-xs px-2 py-1"
                                        >
                                            {t("Clear Filters")}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Items List or Raw Text Editor */}
                        <div className="flex-1 overflow-y-auto min-h-0">
                            {!isParseable ? (
                                <div className="flex flex-col h-full">
                                    <label
                                        className={`block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 ${isRTL ? "text-right" : "text-left"}`}
                                        htmlFor="raw-memory-editor"
                                        dir={direction}
                                    >
                                        {t("Memory (Raw Text Format)")}
                                        <span className={`${isRTL ? "ms-2" : "ms-2"} text-xs text-gray-500 dark:text-gray-400`}>
                                            ({t("Not parseable as structured memory")})
                                        </span>
                                    </label>
                                    <textarea
                                        id="raw-memory-editor"
                                        value={rawMemory}
                                        onChange={(e) => setRawMemory(e.target.value)}
                                        className="lb-input font-mono w-full flex-1 resize-none"
                                        placeholder={t(
                                            "Enter memory content. Use format: priority|timestamp|content (one per line) for structured editing, or plain text.",
                                        )}
                                        dir={direction}
                                    />
                                </div>
                            ) : items.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                    <p>{t("No memory items. Click 'Add Item' to create one.")}</p>
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                    <p>{t("No items match your filters.")}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-2">
                                        <button
                                            onClick={handleSelectAll}
                                            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2"
                                        >
                                            {selectedIds.size === filteredItems.length
                                                ? t("Deselect All")
                                                : t("Select All")}
                                        </button>
                                    </div>
                                    <DndContext
                                        sensors={sensors}
                                        onDragStart={handleDragStart}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <SortableContext
                                            items={filteredItems.map((item) => item.id)}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {filteredItems.map((item) => (
                                                <SortableMemoryItem
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
                                        </SortableContext>
                                        <DragOverlay>
                                            {activeId ? (
                                                <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 opacity-90 shadow-lg">
                                                    {filteredItems.find((i) => i.id === activeId)?.content}
                                                </div>
                                            ) : null}
                                        </DragOverlay>
                                    </DndContext>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div
                            className={`flex gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 ${isRTL ? "flex-row-reverse" : ""}`}
                        >
                            <button
                                className="lb-outline-secondary flex-1 sm:flex-initial"
                                onClick={onClose}
                            >
                                {t("Cancel")}
                            </button>
                            <button
                                className="lb-primary flex-1 sm:flex-initial"
                                onClick={handleSave}
                            >
                                {t("Save")}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};

export default MemoryEditor;
