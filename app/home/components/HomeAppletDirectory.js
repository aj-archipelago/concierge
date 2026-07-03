"use client";

import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import * as Icons from "lucide-react";
import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
    AppWindow,
    Check,
    ChevronDown,
    GripVertical,
    LayoutGrid,
    Loader2,
    Maximize2,
    Minimize2,
    Pencil,
    Plus,
    Sparkles,
    Trash2,
    X,
} from "lucide-react";
import EmptyState from "@/src/components/common/EmptyState";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import AppCatalogCard, {
    appCatalogActionButtonClass,
    appCatalogConfirmActionButtonClass,
    appCatalogDangerActionButtonClass,
    appCatalogIconButtonClass,
    appCatalogPrimaryActionButtonClass,
} from "@/src/components/apps/AppCatalogCard";
import AppPickerDialog from "@/src/components/apps/AppPickerDialog";
import { normalizeAppletPickerApplet } from "@/src/components/apps/appPickerUtils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import {
    useCurrentUserDigest,
    useUpdateCurrentUserDigest,
} from "../../queries/digest";
import DigestBlock, { FullscreenBlock } from "./DigestBlock";
import EditDigestBlock from "./EditDigestBlock";
import CreateAutomationDialog from "@/src/components/automations/CreateAutomationDialog";

function toIdString(value) {
    if (!value) return null;
    if (typeof value === "object" && value._id) return String(value._id);
    return String(value);
}

function getAppIcon(applet) {
    return applet?.icon && Icons[applet.icon] ? Icons[applet.icon] : AppWindow;
}

function getAppletKeywords(applet, limit = 3) {
    return [
        applet.badgeLabel,
        applet.category,
        ...(Array.isArray(applet.tags) ? applet.tags : []),
    ]
        .filter(Boolean)
        .map((keyword) => String(keyword).trim())
        .filter(Boolean)
        .filter(
            (keyword, index, keywords) => keywords.indexOf(keyword) === index,
        )
        .slice(0, limit);
}

function getAppletHref(applet) {
    if (applet?.slug && applet.listedInStore !== false) {
        return `/apps/${applet.slug}`;
    }
    return `/apps/private/${applet.appletId}`;
}

function normalizeHomeItem(item, index = 0) {
    const type = item?.type;
    if (!["digest", "automation", "applet", "group"].includes(type))
        return null;
    return {
        type,
        groupId: item.groupId ? String(item.groupId) : null,
        title: item.title ? String(item.title) : null,
        blockId: item.blockId ? String(item.blockId) : null,
        automationId: item.automationId ? String(item.automationId) : null,
        appletId: item.appletId ? String(item.appletId) : null,
        size: item.size === "mini" ? "mini" : "large",
        order: Number.isFinite(item.order) ? item.order : index,
    };
}

function serializeHomeItems(items) {
    return items.map((item, index) => ({
        type: item.type,
        ...(item.groupId ? { groupId: item.groupId } : {}),
        ...(item.title ? { title: item.title } : {}),
        ...(item.blockId ? { blockId: item.blockId } : {}),
        ...(item.automationId ? { automationId: item.automationId } : {}),
        ...(item.appletId ? { appletId: item.appletId } : {}),
        size: item.size === "mini" ? "mini" : "large",
        order: index,
    }));
}

function createItemKey(item) {
    if (item.type === "group") return `group:${item.groupId}`;
    if (item.type === "applet") return `applet:${item.appletId}`;
    return `${item.type}:${item.blockId || item.automationId}`;
}

function createGroupId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createDefaultHomeGroup(title) {
    return {
        type: "group",
        groupId: "home-default",
        title,
        order: 0,
    };
}

function ensureDefaultHomeGroup(items, title) {
    const normalizedItems = (items || [])
        .map(normalizeHomeItem)
        .filter(Boolean);
    if (normalizedItems.some((item) => item.type === "group")) {
        return normalizedItems;
    }
    return [
        createDefaultHomeGroup(title),
        ...normalizedItems.map((item, index) => ({
            ...item,
            order: index + 1,
        })),
    ];
}

function buildFallbackHomeItems(blocks, applets, defaultTitle = "Home") {
    return [
        createDefaultHomeGroup(defaultTitle),
        ...(Array.isArray(blocks) ? blocks : [])
            .map((block, index) => {
                const blockId = toIdString(block?._id || block?.id);
                if (!blockId) return null;
                return {
                    type: block.automationId ? "automation" : "digest",
                    blockId,
                    automationId: toIdString(block.automationId),
                    size: "large",
                    order: index + 1,
                };
            })
            .filter(Boolean),
        ...(Array.isArray(applets) ? applets : []).map((applet, index) => ({
            type: "applet",
            appletId: applet.appletId,
            size: "large",
            order: index + (blocks?.length || 0) + 1,
        })),
    ];
}

function resolveHomeItems(items, blocks, applets) {
    const blockById = new Map(
        (Array.isArray(blocks) ? blocks : [])
            .map((block) => [toIdString(block?._id || block?.id), block])
            .filter(([id]) => id),
    );
    const blockByAutomationId = new Map(
        (Array.isArray(blocks) ? blocks : [])
            .filter((block) => block?.automationId)
            .map((block) => [toIdString(block.automationId), block]),
    );
    const appletById = new Map(
        (Array.isArray(applets) ? applets : []).map((applet) => [
            applet.appletId,
            applet,
        ]),
    );

    return items
        .map((item, index) => {
            const normalized = normalizeHomeItem(item, index);
            if (!normalized) return null;

            if (normalized.type === "group") {
                return normalized.groupId ? normalized : null;
            }

            if (normalized.type === "applet") {
                const applet = appletById.get(normalized.appletId);
                return applet ? { ...normalized, applet } : null;
            }

            const block =
                blockById.get(normalized.blockId) ||
                blockByAutomationId.get(normalized.automationId);
            return block
                ? {
                      ...normalized,
                      block,
                      blockId: toIdString(block._id || block.id),
                      automationId: toIdString(block.automationId),
                  }
                : null;
        })
        .filter(Boolean);
}

function buildHomeSections(items) {
    const sections = [];
    let currentSection = null;

    items.forEach((item) => {
        if (item.type === "group") {
            currentSection = { group: item, items: [] };
            sections.push(currentSection);
            return;
        }

        if (!currentSection) {
            currentSection = { group: null, items: [] };
            sections.push(currentSection);
        }
        currentSection.items.push(item);
    });

    return sections;
}

function getInsertIndexForGroup(items, groupId) {
    if (!groupId) {
        const firstGroupIndex = items.findIndex(
            (item) => item.type === "group",
        );
        return firstGroupIndex === -1 ? items.length : firstGroupIndex;
    }

    const groupIndex = items.findIndex(
        (item) => item.type === "group" && item.groupId === groupId,
    );
    if (groupIndex === -1) return items.length;

    let insertIndex = groupIndex + 1;
    while (insertIndex < items.length && items[insertIndex].type !== "group") {
        insertIndex += 1;
    }
    return insertIndex;
}

function createGroupAddPendingKey(type, groupId) {
    return `add:${type}:${groupId ?? "none"}`;
}

function getItemGridClass(item) {
    if (item.size === "mini") {
        return "sm:col-span-1 lg:col-span-3 h-40";
    }
    if (item.type === "applet") {
        return "sm:col-span-1 lg:col-span-3 h-80";
    }
    return "sm:col-span-2 lg:col-span-6 h-80";
}

function getGroupEndInsertIndex(items, groupId) {
    if (groupId === "orphan") {
        const firstGroupIndex = items.findIndex(
            (entry) => entry.type === "group",
        );
        return firstGroupIndex === -1 ? items.length : firstGroupIndex;
    }

    const groupIndex = items.findIndex(
        (entry) => entry.type === "group" && entry.groupId === groupId,
    );
    if (groupIndex < 0) {
        return -1;
    }

    let insertIndex = groupIndex + 1;
    while (insertIndex < items.length && items[insertIndex].type !== "group") {
        insertIndex += 1;
    }
    return insertIndex;
}

function resolveWidgetDropIndex(items, activeId, overId) {
    const currentIndex = items.findIndex(
        (entry) => createItemKey(entry) === activeId,
    );
    if (currentIndex < 0) {
        return null;
    }

    const activeItem = items[currentIndex];
    if (!activeItem || activeItem.type === "group") {
        return null;
    }

    if (overId.startsWith("group-drop:")) {
        const groupId = overId.slice("group-drop:".length);
        const targetIndex = getGroupEndInsertIndex(items, groupId);
        if (targetIndex < 0 || targetIndex === currentIndex) {
            return null;
        }
        return { currentIndex, targetIndex };
    }

    if (overId.startsWith("group:")) {
        const groupId = overId.slice("group:".length);
        const groupIndex = items.findIndex(
            (entry) => entry.type === "group" && entry.groupId === groupId,
        );
        if (groupIndex < 0) {
            return null;
        }
        const targetIndex = groupIndex + 1;
        if (targetIndex === currentIndex) {
            return null;
        }
        return { currentIndex, targetIndex };
    }

    const targetIndex = items.findIndex(
        (entry) => createItemKey(entry) === overId,
    );
    if (targetIndex < 0 || targetIndex === currentIndex) {
        return null;
    }

    return { currentIndex, targetIndex };
}

function getHomeGroupBlocks(items) {
    const blocks = [];
    let index = 0;

    while (index < items.length) {
        const blockIndices = [index];
        index += 1;
        while (index < items.length && items[index].type !== "group") {
            blockIndices.push(index);
            index += 1;
        }
        blocks.push(blockIndices);
    }

    return blocks;
}

function moveGroupBlock(items, activeGroupIndex, overGroupIndex) {
    const blocks = getHomeGroupBlocks(items);
    const activeBlockIndex = blocks.findIndex((block) =>
        block.includes(activeGroupIndex),
    );
    const overBlockIndex = blocks.findIndex((block) =>
        block.includes(overGroupIndex),
    );
    if (
        activeBlockIndex < 0 ||
        overBlockIndex < 0 ||
        activeBlockIndex === overBlockIndex
    ) {
        return items;
    }

    return arrayMove(blocks, activeBlockIndex, overBlockIndex).flatMap(
        (block) => block.map((itemIndex) => items[itemIndex]),
    );
}

function createHomeCollisionDetection(items) {
    return (args) => {
        const activeId = String(args.active?.id ?? "");
        if (activeId.startsWith("group:")) {
            return closestCenter({
                ...args,
                droppableContainers: args.droppableContainers.filter(
                    (container) => String(container.id).startsWith("group:"),
                ),
            });
        }

        return closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(
                (container) => {
                    const containerId = String(container.id);
                    if (containerId === activeId) {
                        return false;
                    }
                    if (containerId.startsWith("group-drop:")) {
                        return true;
                    }
                    if (containerId.startsWith("group:")) {
                        return true;
                    }
                    return items.some(
                        (entry) => createItemKey(entry) === containerId,
                    );
                },
            ),
        });
    };
}

function isAutomationBlock(block) {
    return Boolean(block?.automationId);
}

function getAutomationId(block) {
    return block?.automation?._id || block?.automationId;
}

function getBlockUpdatedAt(block) {
    if (isAutomationBlock(block)) {
        return (
            block?.automationRun?.completedAt || block?.automationRun?.createdAt
        );
    }
    return block?.updatedAt;
}

function stripPreviewText(value) {
    return String(value || "")
        .replace(/[#>*_`~[\]()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getDigestPreview(block, t) {
    if (!block) return "";
    if (isAutomationBlock(block)) {
        if (block.automationMissing) {
            return t("Linked automation no longer exists.");
        }
        const run = block.automationRun;
        if (!run) return t("No runs yet for this automation.");
        if (run.status === "pending" || run.status === "in_progress") {
            return t("Running...");
        }
        if (run.status === "failed") return t("Last run failed.");
        if (run.summary) return stripPreviewText(run.summary);
        if (run.hasHtmlOutput) return t("View latest HTML output");
        return t("No output yet.");
    }

    if (!block.content) return t("digest_block_no_content");
    try {
        const parsed = JSON.parse(block.content);
        return stripPreviewText(
            parsed?.payload || parsed?.text || block.content,
        );
    } catch {
        return stripPreviewText(block.content);
    }
}

function canOpenBlockFullscreen(block) {
    return Boolean(
        (isAutomationBlock(block) &&
            getAutomationId(block) &&
            block?.automationRun) ||
            (!isAutomationBlock(block) && block?.content),
    );
}

function HomeWidgetDialogShell({ title, titleId, onClose, children, t }) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/50 p-2 dark:bg-black/70 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
        >
            <div className="max-h-[calc(100vh-1rem)] w-full max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex min-h-14 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-700">
                    <h2
                        id={titleId}
                        className="truncate text-base font-semibold text-gray-950 dark:text-gray-50"
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        className={appCatalogIconButtonClass}
                        onClick={onClose}
                        title={t("Close")}
                        aria-label={t("Close")}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
                    {children}
                </div>
            </div>
        </div>
    );
}

function AddHomeDigestDialog({ isPending, onAdd, onClose, t }) {
    const [draft, setDraft] = useState({
        title: "",
        prompt: "",
        automationId: null,
    });
    const canAdd = Boolean(draft.prompt?.trim());

    return (
        <HomeWidgetDialogShell
            title={t("Add digest")}
            titleId="home-add-digest-title"
            onClose={onClose}
            t={t}
        >
            <div className="flex min-h-0 flex-col text-start">
                <EditDigestBlock
                    value={draft}
                    onChange={setDraft}
                    preferredMode="prompt"
                    hideSourceToggle
                    compact
                    className="min-h-0"
                />
                <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                        disabled={isPending}
                        onClick={onClose}
                    >
                        <X className="h-4 w-4" />
                        {t("Cancel")}
                    </button>
                    <button
                        type="button"
                        className={cn(
                            appCatalogActionButtonClass,
                            appCatalogPrimaryActionButtonClass,
                        )}
                        disabled={isPending || !canAdd}
                        onClick={() => onAdd(draft)}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="h-4 w-4" />
                        )}
                        {t("Add digest")}
                    </button>
                </div>
            </div>
        </HomeWidgetDialogShell>
    );
}

function AddHomeAutomationDialog({
    isPending,
    onAdd,
    onCreateNew,
    onClose,
    t,
}) {
    const [draft, setDraft] = useState({
        title: "",
        prompt: "",
        automationId: null,
    });
    const canAdd = Boolean(draft.automationId);

    return (
        <HomeWidgetDialogShell
            title={t("Add automation")}
            titleId="home-add-automation-title"
            onClose={onClose}
            t={t}
        >
            <div className="flex min-h-0 flex-col text-start">
                <EditDigestBlock
                    value={draft}
                    onChange={setDraft}
                    preferredMode="automation"
                    hideSourceToggle
                    compact
                    className="min-h-0"
                />
                <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                        disabled={isPending}
                        onClick={onCreateNew}
                    >
                        <Sparkles className="h-4 w-4" />
                        {t("New automation")}
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                            disabled={isPending}
                            onClick={onClose}
                        >
                            <X className="h-4 w-4" />
                            {t("Cancel")}
                        </button>
                        <button
                            type="button"
                            className={cn(
                                appCatalogActionButtonClass,
                                appCatalogPrimaryActionButtonClass,
                            )}
                            disabled={isPending || !canAdd}
                            onClick={() => onAdd(draft)}
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Plus className="h-4 w-4" />
                            )}
                            {t("Add automation")}
                        </button>
                    </div>
                </div>
            </div>
        </HomeWidgetDialogShell>
    );
}

export { getGroupEndInsertIndex, resolveWidgetDropIndex };

export default function HomeAppletDirectory({
    applets,
    initialHomeItems = [],
    initialHomeItemsConfigured = false,
    initialHomeItemsDefaultGroupMigrated = false,
}) {
    const router = useRouter();
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const { data: digest } = useCurrentUserDigest();
    const updateDigest = useUpdateCurrentUserDigest();
    const serverDigestBlocks = useMemo(
        () => digest?.blocks || [],
        [digest?.blocks],
    );
    const [localDigestBlocks, setLocalDigestBlocks] =
        useState(serverDigestBlocks);
    const digestBlocks = localDigestBlocks;
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const [homeApplets, setHomeApplets] = useState(applets || []);
    const defaultHomeTitle = t("Home");
    const [homeItems, setHomeItems] = useState(() => {
        if (
            initialHomeItemsConfigured &&
            !initialHomeItemsDefaultGroupMigrated
        ) {
            return ensureDefaultHomeGroup(initialHomeItems, defaultHomeTitle);
        }
        return (initialHomeItems || []).map(normalizeHomeItem).filter(Boolean);
    });
    const [homeItemsConfigured, setHomeItemsConfigured] = useState(
        Boolean(initialHomeItemsConfigured),
    );
    const [isEditing, setIsEditing] = useState(false);
    const [showAddPanel, setShowAddPanel] = useState(false);
    const [addPanelGroupId, setAddPanelGroupId] = useState(null);
    const [availableApplets, setAvailableApplets] = useState([]);
    const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
    const [pendingKey, setPendingKey] = useState(null);
    const [addDigestTarget, setAddDigestTarget] = useState(null);
    const [addAutomationTarget, setAddAutomationTarget] = useState(null);
    const [automationCreateOpen, setAutomationCreateOpen] = useState(false);
    const [activeDragKey, setActiveDragKey] = useState(null);
    const [scrollTargetKey, setScrollTargetKey] = useState(null);
    const [editingWidgetKey, setEditingWidgetKey] = useState(null);
    const itemNodeRefs = useRef(new Map());

    useEffect(() => {
        setHomeApplets(applets || []);
    }, [applets]);

    useEffect(() => {
        setLocalDigestBlocks(serverDigestBlocks);
    }, [serverDigestBlocks]);

    const fallbackItems = useMemo(
        () =>
            buildFallbackHomeItems(digestBlocks, homeApplets, defaultHomeTitle),
        [defaultHomeTitle, digestBlocks, homeApplets],
    );
    const layoutItems = homeItemsConfigured ? homeItems : fallbackItems;
    const resolvedItems = useMemo(
        () => resolveHomeItems(layoutItems, digestBlocks, homeApplets),
        [digestBlocks, homeApplets, layoutItems],
    );
    const homeSections = useMemo(
        () => buildHomeSections(resolvedItems),
        [resolvedItems],
    );
    const homeAppletIds = useMemo(
        () =>
            resolvedItems
                .filter((item) => item.type === "applet")
                .map((item) => item.appletId),
        [resolvedItems],
    );
    const editingWidget = useMemo(() => {
        if (!editingWidgetKey) {
            return null;
        }
        return (
            resolvedItems.find(
                (item) => createItemKey(item) === editingWidgetKey,
            ) || null
        );
    }, [editingWidgetKey, resolvedItems]);

    useEffect(() => {
        if (!isEditing) {
            setEditingWidgetKey(null);
        }
    }, [isEditing]);
    const groupSortableIds = useMemo(
        () =>
            resolvedItems
                .filter((item) => item.type === "group")
                .map(createItemKey),
        [resolvedItems],
    );
    const collisionDetection = useMemo(
        () => createHomeCollisionDetection(resolvedItems),
        [resolvedItems],
    );
    const isGroupDragActive = Boolean(
        activeDragKey && activeDragKey.startsWith("group:"),
    );
    const isItemDragActive = Boolean(
        activeDragKey && !activeDragKey.startsWith("group:"),
    );
    const isHomeEmpty = resolvedItems.length === 0;

    const addableApplets = useMemo(() => {
        const currentIds = new Set(homeAppletIds);
        return availableApplets.filter(
            (applet) => !currentIds.has(applet.appletId),
        );
    }, [availableApplets, homeAppletIds]);

    const registerItemNode = useCallback((key, node) => {
        if (!key) return;
        if (node) {
            itemNodeRefs.current.set(key, node);
        } else {
            itemNodeRefs.current.delete(key);
        }
    }, []);

    useEffect(() => {
        if (!scrollTargetKey) return undefined;

        const node = itemNodeRefs.current.get(scrollTargetKey);
        if (!node) return undefined;

        const scroll = () => {
            node.scrollIntoView?.({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
            });
            setScrollTargetKey(null);
        };

        if (typeof window.requestAnimationFrame === "function") {
            const frame = window.requestAnimationFrame(scroll);
            return () => window.cancelAnimationFrame?.(frame);
        }

        scroll();
        return undefined;
    }, [resolvedItems, scrollTargetKey]);

    const saveHomeItems = async (nextItems) => {
        const serialized = serializeHomeItems(nextItems);
        const response = await fetch("/api/users/me/home-items", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ homeItems: serialized }),
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || t("Failed to update Home layout"));
        }
        const data = await response.json();
        const savedItems = Array.isArray(data.homeItems)
            ? data.homeItems.map(normalizeHomeItem).filter(Boolean)
            : serialized;
        setHomeItems(savedItems);
        setHomeItemsConfigured(true);
        return savedItems;
    };

    const loadAvailableApplets = async (groupId = null) => {
        setAddPanelGroupId(groupId);
        setShowAddPanel(true);
        if (availableApplets.length > 0 || isLoadingAvailable) return;

        try {
            setIsLoadingAvailable(true);
            const response = await fetch("/api/canvas-applets");
            if (!response.ok) {
                throw new Error(t("Failed to load applets"));
            }
            const data = await response.json();
            setAvailableApplets(
                (Array.isArray(data.applets) ? data.applets : [])
                    .map(normalizeAppletPickerApplet)
                    .filter(Boolean),
            );
        } catch (error) {
            console.error("Error loading available home applets:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home applets. Please try again."),
            );
        } finally {
            setIsLoadingAvailable(false);
        }
    };

    const persistResolvedItems = (nextResolvedItems) =>
        saveHomeItems(
            nextResolvedItems.map(({ block, applet, ...item }) => item),
        );

    const handleDragStart = ({ active }) => {
        setActiveDragKey(String(active.id));
    };

    const handleDragCancel = () => {
        setActiveDragKey(null);
    };

    const handleDragEnd = async ({ active, over }) => {
        setActiveDragKey(null);
        if (!over || active.id === over.id || pendingKey) {
            return;
        }

        const currentIndex = resolvedItems.findIndex(
            (entry) => createItemKey(entry) === active.id,
        );
        if (currentIndex < 0) return;

        const previousItems = layoutItems;
        const activeItem = resolvedItems[currentIndex];
        if (!activeItem) return;

        let nextItems = resolvedItems;
        if (activeItem.type === "group") {
            const nextIndex = resolvedItems.findIndex(
                (entry) => createItemKey(entry) === over.id,
            );
            if (nextIndex < 0) return;
            const overItem = resolvedItems[nextIndex];
            if (!overItem || overItem.type !== "group") return;
            nextItems = moveGroupBlock(resolvedItems, currentIndex, nextIndex);
        } else {
            const move = resolveWidgetDropIndex(
                resolvedItems,
                String(active.id),
                String(over.id),
            );
            if (!move) return;
            nextItems = arrayMove(
                resolvedItems,
                move.currentIndex,
                move.targetIndex,
            );
        }

        try {
            setPendingKey(String(active.id));
            setHomeItems(nextItems.map(({ block, applet, ...entry }) => entry));
            setHomeItemsConfigured(true);
            await persistResolvedItems(nextItems);
        } catch (error) {
            console.error("Error reordering home items:", error);
            setHomeItems(previousItems);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
        } finally {
            setPendingKey(null);
        }
    };

    const handleRemove = async (item) => {
        const nextItems = resolvedItems.filter(
            (entry) => createItemKey(entry) !== createItemKey(item),
        );
        try {
            setPendingKey(createItemKey(item));
            await persistResolvedItems(nextItems);
        } catch (error) {
            console.error("Error removing home item:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
        } finally {
            setPendingKey(null);
        }
    };

    const handleResize = async (item) => {
        const nextItems = resolvedItems.map((entry) =>
            createItemKey(entry) === createItemKey(item)
                ? {
                      ...entry,
                      size: entry.size === "mini" ? "large" : "mini",
                  }
                : entry,
        );
        try {
            setPendingKey(createItemKey(item));
            await persistResolvedItems(nextItems);
        } catch (error) {
            console.error("Error resizing home item:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
        } finally {
            setPendingKey(null);
        }
    };

    const handleRenameGroup = async (item, title) => {
        const nextTitle = title.trim() || t("New group");
        if (item.title === nextTitle) return;

        const nextItems = resolvedItems.map((entry) =>
            createItemKey(entry) === createItemKey(item)
                ? {
                      ...entry,
                      title: nextTitle,
                  }
                : entry,
        );
        try {
            setPendingKey(createItemKey(item));
            await persistResolvedItems(nextItems);
        } catch (error) {
            console.error("Error renaming home group:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
        } finally {
            setPendingKey(null);
        }
    };

    const handleUpdateBlock = async (item, nextBlock) => {
        const blockId = toIdString(item.block?._id || item.block?.id);
        if (!blockId) return false;

        const updatedBlock = {
            ...item.block,
            ...nextBlock,
            automationId: toIdString(nextBlock.automationId),
        };
        const nextBlocks = digestBlocks.map((block) =>
            toIdString(block?._id || block?.id) === blockId
                ? updatedBlock
                : block,
        );
        const nextType = updatedBlock.automationId ? "automation" : "digest";
        const nextAutomationId = toIdString(updatedBlock.automationId);
        const nextItems = resolvedItems.map((entry) =>
            createItemKey(entry) === createItemKey(item)
                ? {
                      ...entry,
                      type: nextType,
                      automationId: nextAutomationId,
                      block: updatedBlock,
                  }
                : entry,
        );
        const shouldPersistHomeItem =
            item.type !== nextType || item.automationId !== nextAutomationId;

        try {
            setPendingKey(createItemKey(item));
            setLocalDigestBlocks(nextBlocks);
            await updateDigest.mutateAsync({ blocks: nextBlocks });
            if (shouldPersistHomeItem) {
                await persistResolvedItems(nextItems);
            }
            return true;
        } catch (error) {
            setLocalDigestBlocks(digestBlocks);
            console.error("Error updating home digest item:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
            return false;
        } finally {
            setPendingKey(null);
        }
    };

    const addResolvedItem = async (item, { groupId = null } = {}) => {
        const baseItems = resolvedItems.map(
            ({ block, applet, ...entry }) => entry,
        );
        const insertIndex = getInsertIndexForGroup(baseItems, groupId);
        const nextItem = {
            ...item,
            size: item.size || "large",
            order: insertIndex,
        };
        const nextItems = [
            ...baseItems.slice(0, insertIndex),
            nextItem,
            ...baseItems.slice(insertIndex),
        ];
        await saveHomeItems(nextItems);
        setScrollTargetKey(createItemKey(nextItem));
    };

    const addResolvedItems = async (items, { groupId = null } = {}) => {
        const baseItems = resolvedItems.map(
            ({ block, applet, ...entry }) => entry,
        );
        const insertIndex = getInsertIndexForGroup(baseItems, groupId);
        const nextItems = [
            ...baseItems.slice(0, insertIndex),
            ...items.map((item, index) => ({
                ...item,
                size: item.size || "large",
                order: insertIndex + index,
            })),
            ...baseItems.slice(insertIndex),
        ];
        await saveHomeItems(nextItems);
        const lastItem = nextItems[insertIndex + items.length - 1];
        if (lastItem) {
            setScrollTargetKey(createItemKey(lastItem));
        }
    };

    const handleAddGroup = async () => {
        try {
            setPendingKey("add:group");
            await addResolvedItem({
                type: "group",
                groupId: createGroupId(),
                title: t("New group"),
            });
        } catch (error) {
            console.error("Error adding home group:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
        } finally {
            setPendingKey(null);
        }
    };

    const handleAddApplets = async ({ applets: selectedApplets = [] }) => {
        if (!selectedApplets.length) return;

        try {
            setPendingKey("commit");
            await addResolvedItems(
                selectedApplets.map((applet) => ({
                    type: "applet",
                    appletId: applet.appletId,
                    size: "large",
                })),
                { groupId: addPanelGroupId },
            );
            setHomeApplets((current) => [
                ...current,
                ...selectedApplets.filter(
                    (applet) =>
                        !current.some(
                            (item) => item.appletId === applet.appletId,
                        ),
                ),
            ]);
            setShowAddPanel(false);
            setAddPanelGroupId(null);
        } catch (error) {
            console.error("Error adding home applet:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
        } finally {
            setPendingKey(null);
        }
    };

    const handleAddDigest = (groupId = null) => {
        setAddDigestTarget({ groupId });
    };

    const commitHomeWidgetBlock = async (
        { title, prompt, automationId },
        groupId,
        itemType,
    ) => {
        const pendingType = itemType === "automation" ? "automation" : "digest";
        try {
            setPendingKey(createGroupAddPendingKey(pendingType, groupId));
            const blockPayload = {
                title: title?.trim() || "",
                prompt: prompt?.trim() || "",
            };
            const normalizedAutomationId = toIdString(automationId);
            if (normalizedAutomationId) {
                blockPayload.automationId = normalizedAutomationId;
            }
            const nextDigest = await updateDigest.mutateAsync({
                blocks: [...digestBlocks, blockPayload],
            });
            setLocalDigestBlocks(nextDigest?.blocks || digestBlocks);
            const block = [...(nextDigest?.blocks || [])].at(-1);
            const blockId = toIdString(block?._id || block?.id);
            if (!blockId) {
                return;
            }
            await addResolvedItem(
                {
                    type: itemType,
                    blockId,
                    ...(normalizedAutomationId
                        ? { automationId: normalizedAutomationId }
                        : {}),
                    size: "large",
                },
                { groupId },
            );
        } catch (error) {
            console.error(`Error adding ${itemType} home item:`, error);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
            throw error;
        } finally {
            setPendingKey(null);
        }
    };

    const handleDigestDialogAdd = async (block) => {
        if (!addDigestTarget || !block?.prompt?.trim()) {
            return;
        }
        const { groupId } = addDigestTarget;
        try {
            await commitHomeWidgetBlock(block, groupId, "digest");
            setAddDigestTarget(null);
        } catch {
            // Error toast already shown.
        }
    };

    const handleAutomationDialogAdd = async (block) => {
        if (!addAutomationTarget || !block?.automationId) {
            return;
        }
        const { groupId } = addAutomationTarget;
        try {
            await commitHomeWidgetBlock(block, groupId, "automation");
            setAddAutomationTarget(null);
        } catch {
            // Error toast already shown.
        }
    };

    const handleAutomationCreated = async (created) => {
        if (!addAutomationTarget) {
            return;
        }
        const { groupId } = addAutomationTarget;
        try {
            await commitHomeWidgetBlock(
                {
                    title: created?.name || "",
                    prompt: "",
                    automationId: created?._id,
                },
                groupId,
                "automation",
            );
            setAddAutomationTarget(null);
            setAutomationCreateOpen(false);
        } catch {
            // Error toast already shown.
        }
    };

    const handleAddAutomation = (groupId = null) => {
        setAddAutomationTarget({ groupId });
    };

    const addDigestPendingKey = addDigestTarget
        ? createGroupAddPendingKey("digest", addDigestTarget.groupId)
        : null;
    const addAutomationPendingKey = addAutomationTarget
        ? createGroupAddPendingKey("automation", addAutomationTarget.groupId)
        : null;

    return (
        <main
            className={cn(
                "min-h-screen bg-gray-50 px-4 dark:bg-gray-900 sm:px-6 lg:px-8",
                isEditing ? "py-5" : "py-4",
            )}
            dir={direction}
        >
            <div className="mx-auto max-w-7xl">
                <div
                    className={cn(
                        isEditing
                            ? "sticky top-0 z-40 -mx-2 mb-4 flex flex-col gap-3 rounded-lg border border-gray-200/80 bg-gray-50/90 px-2 py-2 shadow-sm backdrop-blur dark:border-gray-700/80 dark:bg-gray-900/90 sm:flex-row sm:items-center sm:justify-end"
                            : "sticky top-0 z-40 -mx-2 flex h-0 justify-end overflow-visible px-2",
                    )}
                >
                    <div
                        className={cn(
                            "flex flex-wrap items-center gap-2",
                            !isEditing && "pointer-events-auto",
                        )}
                    >
                        {isEditing && (
                            <button
                                type="button"
                                className={cn(
                                    appCatalogActionButtonClass,
                                    appCatalogPrimaryActionButtonClass,
                                )}
                                onClick={handleAddGroup}
                                disabled={Boolean(pendingKey)}
                            >
                                {pendingKey === "add:group" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Plus className="h-4 w-4" />
                                )}
                                {t("Add group")}
                            </button>
                        )}
                        <button
                            type="button"
                            title={isEditing ? t("Done") : t("Edit")}
                            aria-label={isEditing ? t("Done") : t("Edit")}
                            aria-pressed={isEditing}
                            className={cn(
                                isEditing
                                    ? cn(
                                          appCatalogActionButtonClass,
                                          appCatalogConfirmActionButtonClass,
                                      )
                                    : "mt-2 me-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-500 shadow-sm backdrop-blur transition hover:bg-gray-50 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200",
                            )}
                            onClick={() => setIsEditing((current) => !current)}
                            disabled={Boolean(pendingKey)}
                        >
                            {isEditing ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    {t("Done")}
                                </>
                            ) : (
                                <Pencil className="h-3.5 w-3.5" />
                            )}
                        </button>
                    </div>
                </div>

                {isHomeEmpty ? (
                    <HomePageEmptyState isEditing={isEditing} t={t} />
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={collisionDetection}
                        onDragStart={handleDragStart}
                        onDragCancel={handleDragCancel}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={groupSortableIds}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-6">
                                {homeSections.map((section, sectionIndex) => (
                                    <HomeGroupSection
                                        key={
                                            section.group
                                                ? createItemKey(section.group)
                                                : `section-${sectionIndex}`
                                        }
                                        section={section}
                                        isEditing={isEditing}
                                        pendingKey={pendingKey}
                                        isDragDisabled={
                                            !isEditing || Boolean(pendingKey)
                                        }
                                        isGroupDragActive={isGroupDragActive}
                                        isItemDragActive={isItemDragActive}
                                        onOpen={(item) => {
                                            if (item.type === "applet") {
                                                router.push(
                                                    getAppletHref(item.applet),
                                                );
                                            }
                                        }}
                                        onRemove={handleRemove}
                                        onRenameGroup={handleRenameGroup}
                                        onResize={handleResize}
                                        onEditWidget={(item) =>
                                            setEditingWidgetKey(
                                                createItemKey(item),
                                            )
                                        }
                                        registerItemNode={registerItemNode}
                                        onAddDigest={handleAddDigest}
                                        onAddAutomation={handleAddAutomation}
                                        onAddApplet={loadAvailableApplets}
                                        t={t}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {showAddPanel && (
                <AppPickerDialog
                    title={t("Add applet to Home")}
                    applets={addableApplets}
                    isLoadingApplets={isLoadingAvailable}
                    onCommit={handleAddApplets}
                    onClose={() => {
                        setShowAddPanel(false);
                        setAddPanelGroupId(null);
                    }}
                    pendingKey={pendingKey}
                />
            )}

            {editingWidget &&
                (editingWidget.type === "digest" ||
                    editingWidget.type === "automation") && (
                    <HomeDigestBlockEditDialog
                        item={editingWidget}
                        isPending={pendingKey === editingWidgetKey}
                        onSave={async (nextBlock) => {
                            const saved = await handleUpdateBlock(
                                editingWidget,
                                nextBlock,
                            );
                            if (saved) {
                                setEditingWidgetKey(null);
                            }
                        }}
                        onClose={() => setEditingWidgetKey(null)}
                        t={t}
                    />
                )}

            {addDigestTarget ? (
                <AddHomeDigestDialog
                    isPending={pendingKey === addDigestPendingKey}
                    onAdd={handleDigestDialogAdd}
                    onClose={() => setAddDigestTarget(null)}
                    t={t}
                />
            ) : null}

            {addAutomationTarget ? (
                <AddHomeAutomationDialog
                    isPending={pendingKey === addAutomationPendingKey}
                    onAdd={handleAutomationDialogAdd}
                    onCreateNew={() => setAutomationCreateOpen(true)}
                    onClose={() => {
                        setAddAutomationTarget(null);
                        setAutomationCreateOpen(false);
                    }}
                    t={t}
                />
            ) : null}

            <CreateAutomationDialog
                open={automationCreateOpen}
                onOpenChange={setAutomationCreateOpen}
                onCreated={handleAutomationCreated}
            />
        </main>
    );
}

function HomeGroupSection(props) {
    if (props.section.group) {
        return <HomeNamedGroupSection {...props} />;
    }
    return <HomeOrphanGroupSection {...props} />;
}

function GroupItemsDropZone({
    dropId,
    isDisabled,
    isActive = false,
    className,
    children,
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: dropId,
        disabled: isDisabled,
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                className,
                isActive &&
                    isOver &&
                    "ring-2 ring-inset ring-sky-300 dark:ring-sky-600",
            )}
        >
            {children}
        </div>
    );
}

function HomeNamedGroupSection({
    section,
    isEditing,
    pendingKey,
    isDragDisabled,
    isGroupDragActive,
    isItemDragActive,
    onOpen,
    onRemove,
    onRenameGroup,
    onResize,
    onEditWidget,
    registerItemNode,
    onAddDigest,
    onAddAutomation,
    onAddApplet,
    t,
}) {
    const { group, items } = section;
    const groupId = group?.groupId ?? null;
    const groupKey = createItemKey(group);
    const itemSortableIds = useMemo(() => items.map(createItemKey), [items]);
    const isGroupPending = pendingKey === groupKey;
    const {
        attributes: groupAttributes,
        listeners: groupListeners,
        setNodeRef: setGroupNodeRef,
        transform: groupTransform,
        transition: groupTransition,
        isDragging: isGroupDragging,
    } = useSortable({
        id: groupKey,
        disabled: isDragDisabled || isItemDragActive,
    });
    const setGroupContainerRef = useCallback(
        (node) => {
            setGroupNodeRef(node);
            registerItemNode(groupKey, node);
        },
        [groupKey, registerItemNode, setGroupNodeRef],
    );
    const groupStyle = {
        transform: groupTransform
            ? `translate3d(0, ${Math.round(groupTransform.y)}px, 0)`
            : undefined,
        transition: groupTransition || "transform 120ms ease",
    };

    return (
        <section className="space-y-2">
            <div
                ref={setGroupContainerRef}
                style={groupStyle}
                className={cn(
                    "relative rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] dark:border-gray-700/90 dark:bg-gray-800 dark:ring-white/[0.06]",
                    isEditing ? "overflow-visible" : "overflow-hidden",
                    items.length === 0 &&
                        "min-h-20 border-dashed bg-gray-50/70 dark:bg-gray-900/50",
                    isEditing &&
                        items.length > 0 &&
                        "ring-1 ring-gray-200/60 dark:ring-gray-700/60",
                    isGroupDragging && "z-30 opacity-60",
                )}
            >
                {isEditing && (
                    <DragHandle
                        variant="group"
                        attributes={groupAttributes}
                        listeners={groupListeners}
                        isPending={isGroupPending}
                        t={t}
                    />
                )}
                {isEditing && (
                    <EditActions
                        item={group}
                        isPending={isGroupPending}
                        onRemove={onRemove}
                        t={t}
                    />
                )}
                <HomeGroupTitle
                    item={group}
                    isEditing={isEditing}
                    isPending={isGroupPending}
                    onRename={onRenameGroup}
                    hasContentBelow={items.length > 0 || isEditing}
                    t={t}
                />
                <GroupItemsDropZone
                    dropId={`group-drop:${groupId}`}
                    isDisabled={isDragDisabled || isGroupDragActive}
                    isActive={isItemDragActive}
                    className={cn(items.length === 0 && "min-h-20")}
                >
                    {items.length > 0 ? (
                        <SortableContext
                            items={itemSortableIds}
                            strategy={rectSortingStrategy}
                        >
                            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-12">
                                {items.map((item) => (
                                    <HomeGridItem
                                        key={createItemKey(item)}
                                        item={item}
                                        isEditing={isEditing}
                                        isPending={
                                            pendingKey === createItemKey(item)
                                        }
                                        isDragDisabled={
                                            isDragDisabled || isGroupDragActive
                                        }
                                        onOpen={() => onOpen(item)}
                                        onRemove={onRemove}
                                        onResize={onResize}
                                        onEditWidget={onEditWidget}
                                        registerItemNode={registerItemNode}
                                        t={t}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    ) : (
                        <div className="px-3 pt-1 pb-3">
                            <EmptyAddState label={t("This group is empty.")} />
                        </div>
                    )}
                    {isEditing ? (
                        <div
                            className={cn(
                                "flex justify-center p-3",
                                items.length > 0 &&
                                    "border-t border-dashed border-gray-200 dark:border-gray-700",
                            )}
                        >
                            <HomeGroupAddMenu
                                groupId={groupId}
                                pendingKey={pendingKey}
                                disabled={Boolean(pendingKey)}
                                onAddDigest={onAddDigest}
                                onAddAutomation={onAddAutomation}
                                onAddApplet={onAddApplet}
                                t={t}
                            />
                        </div>
                    ) : null}
                </GroupItemsDropZone>
            </div>
        </section>
    );
}

function HomeGroupAddMenu({
    groupId,
    pendingKey,
    disabled,
    onAddDigest,
    onAddAutomation,
    onAddApplet,
    t,
}) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);
    const isDigestPending =
        pendingKey === createGroupAddPendingKey("digest", groupId);
    const isAutomationPending =
        pendingKey === createGroupAddPendingKey("automation", groupId);
    const isMenuPending = isDigestPending || isAutomationPending;

    useEffect(() => {
        if (!open) return undefined;

        const handlePointerDown = (event) => {
            if (!menuRef.current?.contains(event.target)) {
                setOpen(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [open]);

    const handleSelect = (action) => {
        setOpen(false);
        action();
    };

    return (
        <div ref={menuRef} className="relative">
            <button
                type="button"
                disabled={disabled}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={t("Add")}
                onClick={() => setOpen((current) => !current)}
                className={cn(
                    appCatalogActionButtonClass,
                    appCatalogPrimaryActionButtonClass,
                    "min-h-10 min-w-[7.5rem] justify-center border-dashed",
                )}
            >
                {isMenuPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Plus className="h-4 w-4" />
                )}
                {t("Add")}
                <ChevronDown className="h-4 w-4 opacity-70" />
            </button>
            {open ? (
                <div
                    role="menu"
                    className="absolute start-1/2 top-[calc(100%+0.5rem)] z-50 min-w-[11rem] -translate-x-1/2 overflow-hidden rounded-md border border-gray-200 bg-white p-1 text-gray-950 shadow-md dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
                >
                    <button
                        type="button"
                        role="menuitem"
                        disabled={disabled}
                        onClick={() => handleSelect(() => onAddDigest(groupId))}
                        className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-start text-sm text-gray-800 outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
                    >
                        {t("Add digest")}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={disabled}
                        onClick={() =>
                            handleSelect(() => onAddAutomation(groupId))
                        }
                        className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-start text-sm text-gray-800 outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
                    >
                        {t("Add automation")}
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={disabled}
                        onClick={() => handleSelect(() => onAddApplet(groupId))}
                        className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-start text-sm text-gray-800 outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
                    >
                        {t("Add applet")}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function HomeOrphanGroupSection({
    section,
    isEditing,
    pendingKey,
    isDragDisabled,
    isGroupDragActive,
    isItemDragActive,
    onOpen,
    onRemove,
    onResize,
    onEditWidget,
    registerItemNode,
    t,
}) {
    const { items } = section;
    const itemSortableIds = useMemo(() => items.map(createItemKey), [items]);
    if (items.length === 0) {
        return null;
    }

    return (
        <section className="space-y-2">
            <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] dark:border-gray-700/90 dark:bg-gray-800 dark:ring-white/[0.06]">
                <GroupItemsDropZone
                    dropId="group-drop:orphan"
                    isDisabled={isDragDisabled || isGroupDragActive}
                    isActive={isItemDragActive}
                >
                    <SortableContext
                        items={itemSortableIds}
                        strategy={rectSortingStrategy}
                    >
                        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-12">
                            {items.map((item) => (
                                <HomeGridItem
                                    key={createItemKey(item)}
                                    item={item}
                                    isEditing={isEditing}
                                    isPending={
                                        pendingKey === createItemKey(item)
                                    }
                                    isDragDisabled={
                                        isDragDisabled || isGroupDragActive
                                    }
                                    onOpen={() => onOpen(item)}
                                    onRemove={onRemove}
                                    onResize={onResize}
                                    onEditWidget={onEditWidget}
                                    registerItemNode={registerItemNode}
                                    t={t}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </GroupItemsDropZone>
            </div>
        </section>
    );
}

function HomeGridItem({
    item,
    isEditing,
    isPending,
    isDragDisabled,
    onOpen,
    onRemove,
    onResize,
    onEditWidget,
    registerItemNode,
    t,
}) {
    const itemKey = createItemKey(item);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: itemKey, disabled: isDragDisabled });
    const setItemNodeRef = useCallback(
        (node) => {
            setNodeRef(node);
            registerItemNode(itemKey, node);
        },
        [itemKey, registerItemNode, setNodeRef],
    );
    const style = {
        transform: transform
            ? `translate3d(${item.type === "group" ? 0 : Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
            : undefined,
        transition: transition || "transform 120ms ease",
    };
    const actions = isEditing ? (
        <EditActions
            item={item}
            isPending={isPending}
            onRemove={onRemove}
            onResize={onResize}
            onEdit={
                item.type === "digest" || item.type === "automation"
                    ? () => onEditWidget?.(item)
                    : undefined
            }
            t={t}
        />
    ) : null;

    return (
        <div
            ref={setItemNodeRef}
            style={style}
            className={cn(
                "relative",
                getItemGridClass(item),
                isDragging && "z-30 opacity-60 shadow-xl",
            )}
        >
            {isEditing && (
                <DragHandle
                    attributes={attributes}
                    listeners={listeners}
                    isPending={isPending}
                    t={t}
                />
            )}
            {actions}
            {item.type === "applet" ? (
                item.size === "mini" ? (
                    <HomeAppletMiniCard
                        applet={item.applet}
                        isEditing={isEditing}
                        isPending={isPending}
                        onOpen={onOpen}
                    />
                ) : (
                    <HomeAppletCard
                        applet={item.applet}
                        isEditing={isEditing}
                        isPending={isPending}
                        onOpen={onOpen}
                        t={t}
                    />
                )
            ) : (
                <>
                    {item.size === "mini" ? (
                        <DigestMiniCard
                            block={item.block}
                            isLayoutEditing={isEditing}
                            t={t}
                        />
                    ) : (
                        <div
                            className={cn(
                                "relative h-full",
                                isEditing && "pt-14",
                            )}
                        >
                            <DigestBlock
                                block={item.block}
                                className={cn(
                                    "h-full overflow-hidden",
                                    !isEditing &&
                                        "transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:hover:border-sky-700",
                                )}
                                contentClassName="max-h-56 overflow-auto"
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function HomeDigestBlockEditor({
    itemType,
    block,
    isPending,
    onSave,
    onCancel,
    t,
}) {
    const [draft, setDraft] = useState(block || {});

    useEffect(() => {
        setDraft(block || {});
    }, [block]);

    const hasChanges =
        String(draft.title || "") !== String(block?.title || "") ||
        String(draft.prompt || "") !== String(block?.prompt || "") ||
        String(draft.automationId || "") !== String(block?.automationId || "");

    const handleCancel = () => {
        setDraft(block || {});
        onCancel?.();
    };

    return (
        <div className="flex min-h-0 flex-col text-start">
            <EditDigestBlock
                key={toIdString(block?._id || block?.id) || "new-block"}
                value={draft}
                onChange={setDraft}
                preferredMode={itemType === "automation" ? "automation" : null}
                compact
                className="min-h-0"
            />
            <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                    type="button"
                    className={cn(
                        appCatalogActionButtonClass,
                        appCatalogPrimaryActionButtonClass,
                    )}
                    disabled={isPending || !hasChanges}
                    onClick={() => onSave(draft)}
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Check className="h-4 w-4" />
                    )}
                    {t("Save")}
                </button>
                <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                    disabled={isPending}
                    onClick={handleCancel}
                >
                    <X className="h-4 w-4" />
                    {t("Cancel")}
                </button>
            </div>
        </div>
    );
}

function HomeDigestBlockEditDialog({ item, isPending, onSave, onClose, t }) {
    const widgetTitle = item.block?.title || t("Edit widget");

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/50 p-2 dark:bg-black/70 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-widget-edit-title"
        >
            <div className="max-h-[calc(100vh-1rem)] w-full max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex min-h-14 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-700">
                    <h2
                        id="home-widget-edit-title"
                        className="truncate text-base font-semibold text-gray-950 dark:text-gray-50"
                    >
                        {t(widgetTitle, { defaultValue: widgetTitle })}
                    </h2>
                    <button
                        type="button"
                        className={appCatalogIconButtonClass}
                        onClick={onClose}
                        title={t("Close")}
                        aria-label={t("Close")}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
                    <HomeDigestBlockEditor
                        itemType={item.type}
                        block={item.block}
                        isPending={isPending}
                        onSave={onSave}
                        onCancel={onClose}
                        t={t}
                    />
                </div>
            </div>
        </div>
    );
}

function EditActions({ item, isPending, onRemove, onResize, onEdit, t }) {
    if (item.type === "group") {
        return (
            <div className="absolute end-2 top-2 z-20 flex items-center justify-end gap-1">
                <button
                    type="button"
                    className={cn(
                        appCatalogIconButtonClass,
                        appCatalogDangerActionButtonClass,
                    )}
                    onClick={() => onRemove(item)}
                    disabled={isPending}
                    title={t("Remove group")}
                    aria-label={t("Remove group")}
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 className="h-4 w-4" />
                    )}
                </button>
            </div>
        );
    }

    return (
        <div className="absolute end-2 top-2 z-20 flex max-w-[calc(100%-3.75rem)] items-center justify-end gap-1 overflow-x-auto">
            <button
                type="button"
                className={appCatalogIconButtonClass}
                onClick={() => onResize(item)}
                disabled={isPending}
                title={item.size === "mini" ? t("Make large") : t("Make mini")}
                aria-label={
                    item.size === "mini" ? t("Make large") : t("Make mini")
                }
            >
                {item.size === "mini" ? (
                    <Maximize2 className="h-4 w-4" />
                ) : (
                    <Minimize2 className="h-4 w-4" />
                )}
            </button>
            {onEdit ? (
                <button
                    type="button"
                    className={appCatalogIconButtonClass}
                    onClick={() => onEdit(item)}
                    disabled={isPending}
                    title={t("Edit widget")}
                    aria-label={t("Edit widget")}
                >
                    <Pencil className="h-4 w-4" />
                </button>
            ) : null}
            <button
                type="button"
                className={cn(
                    appCatalogIconButtonClass,
                    appCatalogDangerActionButtonClass,
                )}
                onClick={() => onRemove(item)}
                disabled={isPending}
                title={t("Remove from Home")}
                aria-label={t("Remove from Home")}
            >
                {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Trash2 className="h-4 w-4" />
                )}
            </button>
        </div>
    );
}

function DragHandle({ attributes, listeners, isPending, t, variant = "card" }) {
    if (variant === "group") {
        return (
            <button
                type="button"
                className={cn(
                    "absolute start-2 top-2 z-20 inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-400 transition hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-500 dark:hover:text-gray-300 dark:focus:ring-sky-900/40",
                    "cursor-grab active:cursor-grabbing",
                )}
                disabled={isPending}
                title={t("Drag to reorder Home")}
                aria-label={t("Drag to reorder Home")}
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-4 w-4" />
            </button>
        );
    }

    return (
        <button
            type="button"
            className={cn(
                "absolute start-2 top-2 z-20",
                appCatalogIconButtonClass,
                "cursor-grab active:cursor-grabbing",
            )}
            disabled={isPending}
            title={t("Drag to reorder Home")}
            aria-label={t("Drag to reorder Home")}
            {...attributes}
            {...listeners}
        >
            <GripVertical className="h-4 w-4" />
        </button>
    );
}

function HomeGroupTitle({
    item,
    isEditing,
    isPending,
    onRename,
    hasContentBelow = false,
    t,
}) {
    const [title, setTitle] = useState(item.title || t("New group"));
    const [isRenaming, setIsRenaming] = useState(false);
    const inputRef = useRef(null);
    const displayTitle = item.title || t("New group");

    useEffect(() => {
        setTitle(displayTitle);
    }, [displayTitle]);

    useEffect(() => {
        if (!isEditing) {
            setIsRenaming(false);
        }
    }, [isEditing]);

    useEffect(() => {
        if (isRenaming && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isRenaming]);

    const commitTitle = () => {
        setIsRenaming(false);
        onRename?.(item, title);
    };

    const cancelRename = () => {
        setTitle(displayTitle);
        setIsRenaming(false);
    };

    const headerClassName = cn(
        hasContentBelow &&
            "border-b border-gray-200/80 dark:border-gray-700/80",
    );

    if (!isEditing) {
        return (
            <header className={cn("px-4 py-3 text-start", headerClassName)}>
                <h2 className="truncate text-base font-semibold text-gray-950 dark:text-gray-50">
                    {displayTitle}
                </h2>
            </header>
        );
    }

    if (!isRenaming) {
        return (
            <header
                className={cn(
                    "flex min-h-12 items-center gap-2 px-4 py-2 ps-14 pe-14 text-start",
                    headerClassName,
                )}
            >
                <button
                    type="button"
                    onClick={() => setIsRenaming(true)}
                    disabled={isPending}
                    title={t("Click to edit group title")}
                    aria-label={t("Click to edit group title")}
                    className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-start text-base font-semibold text-gray-950 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-50 dark:hover:bg-gray-800 dark:focus:ring-sky-900/40"
                >
                    {displayTitle}
                </button>
            </header>
        );
    }

    return (
        <header
            className={cn(
                "flex min-h-12 items-center gap-2 px-4 py-2 ps-14 pe-14 text-start",
                headerClassName,
            )}
        >
            <label className="sr-only" htmlFor={`home-group-${item.groupId}`}>
                {t("Group title")}
            </label>
            <input
                ref={inputRef}
                id={`home-group-${item.groupId}`}
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                        event.preventDefault();
                        cancelRename();
                    }
                }}
                disabled={isPending}
                className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-start text-base font-semibold text-gray-950 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:border-sky-500 dark:focus:ring-sky-900/40"
                placeholder={t("Group title")}
            />
        </header>
    );
}

function HomeAppletCard({ applet, isEditing, isPending, onOpen, actions, t }) {
    const IconComponent = getAppIcon(applet);
    const updatedAt = applet.updatedAt ? new Date(applet.updatedAt) : null;

    return (
        <AppCatalogCard
            icon={IconComponent}
            title={applet.name}
            titleAttribute={applet.name}
            imageUrl={applet.imageUrl}
            imageLightUrl={applet.imageLightUrl}
            imageDarkUrl={applet.imageDarkUrl}
            imageAlt={applet.imageAlt || applet.name}
            imageBadge={applet.badgeLabel || applet.category}
            chips={[
                applet.category,
                ...(Array.isArray(applet.tags) ? applet.tags : []),
            ]}
            description={applet.description}
            footer={
                updatedAt ? (
                    <span className="truncate">
                        {t("Updated")} {updatedAt.toLocaleDateString()}
                    </span>
                ) : null
            }
            actions={actions}
            onClick={isEditing ? undefined : onOpen}
            isBusy={isPending && !isEditing}
            disableHover={isEditing}
            imageOverlayVariant="home"
            className="h-full !min-h-0"
        />
    );
}

function HomeAppletMiniCard({ applet, isEditing, isPending, onOpen }) {
    const { t } = useTranslation();
    const IconComponent = getAppIcon(applet);
    const updatedAt = applet.updatedAt ? new Date(applet.updatedAt) : null;

    return (
        <AppCatalogCard
            icon={IconComponent}
            title={applet.name}
            titleAttribute={applet.name}
            imageUrl={applet.imageUrl}
            imageLightUrl={applet.imageLightUrl}
            imageDarkUrl={applet.imageDarkUrl}
            imageAlt={applet.imageAlt || applet.name}
            imageBadge={applet.badgeLabel || applet.category}
            chips={getAppletKeywords(applet, 3)}
            footer={
                updatedAt ? (
                    <span className="truncate">
                        {t("Updated")} {updatedAt.toLocaleDateString()}
                    </span>
                ) : null
            }
            onClick={isEditing ? undefined : onOpen}
            isBusy={isPending && !isEditing}
            disableHover={isEditing}
            density="compact"
            imageOverlayVariant="home"
            contentStackClassName={isEditing ? "pt-14" : undefined}
            className="h-full !min-h-0"
        />
    );
}

function DigestMiniCard({ block, isLayoutEditing = false, t }) {
    const [fullscreen, setFullscreen] = useState(false);
    const updatedAt = getBlockUpdatedAt(block);
    const preview = getDigestPreview(block, t);
    const isAutomation = isAutomationBlock(block);
    const canOpenFullscreen = !isLayoutEditing && canOpenBlockFullscreen(block);
    const openFullscreen = () => {
        if (canOpenFullscreen) setFullscreen(true);
    };

    return (
        <>
            <article
                className={cn(
                    "flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white p-3 shadow-sm transition dark:border-gray-700 dark:bg-gray-800",
                    isLayoutEditing && "pt-14",
                    canOpenFullscreen &&
                        "cursor-pointer hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:hover:border-sky-700",
                )}
                onClick={openFullscreen}
                onKeyDown={(event) => {
                    if (
                        (event.key === "Enter" || event.key === " ") &&
                        canOpenFullscreen
                    ) {
                        event.preventDefault();
                        openFullscreen();
                    }
                }}
                role={canOpenFullscreen ? "button" : undefined}
                tabIndex={canOpenFullscreen ? 0 : undefined}
                aria-label={
                    canOpenFullscreen
                        ? `${t("Full screen")}: ${t(block.title, {
                              defaultValue: block.title,
                          })}`
                        : undefined
                }
            >
                <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-gray-950 dark:text-gray-50">
                            {t(block.title, { defaultValue: block.title })}
                        </h4>
                        {isAutomation && (
                            <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                                <Sparkles className="h-3 w-3" />
                                {t("Automation")}
                            </span>
                        )}
                    </div>
                    {updatedAt && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {new Date(updatedAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
                <p className="mt-3 line-clamp-3 min-h-0 text-sm leading-5 text-gray-600 dark:text-gray-300">
                    {preview}
                </p>
            </article>
            {fullscreen && (
                <FullscreenBlock
                    block={block}
                    onClose={() => setFullscreen(false)}
                />
            )}
        </>
    );
}
function HomePageEmptyState({ isEditing, t }) {
    return (
        <EmptyState
            icon={
                <LayoutGrid className="h-12 w-12 text-gray-400 dark:text-gray-500" />
            }
            title={t("Your home page is empty.")}
            description={
                isEditing
                    ? t("Add a group to start building your home page.")
                    : t(
                          "Click Edit to add groups and pin applets, digests, and automations.",
                      )
            }
        />
    );
}

function EmptyAddState({ label }) {
    return (
        <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {label}
        </div>
    );
}
