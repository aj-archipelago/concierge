"use client";

import PageHeader from "../../../src/layout/PageHeader";
import { HeaderAction } from "../../../src/layout/HeaderControls";
import {
    Fragment,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Menu, Transition } from "@headlessui/react";
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
    AlertTriangle,
    AppWindow,
    Check,
    Compass,
    GripVertical,
    LayoutGrid,
    Loader2,
    Maximize2,
    Minimize2,
    MoreVertical,
    Pencil,
    Plus,
    Sparkles,
    RefreshCw,
    MessageSquare,
    Trash2,
    X,
} from "lucide-react";
import EmptyState from "@/src/components/common/EmptyState";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import AppCatalogCard, {
    appCatalogActionButtonClass,
    appCatalogPrimaryActionButtonClass,
} from "@/src/components/apps/AppCatalogCard";
import { getAppsCatalogList } from "@/src/components/apps/appPickerUtils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import { useTour } from "@/src/contexts/TourContext";
import { getHomeTourSteps } from "@/src/tours/homeTour";
import { useAutomations } from "@/src/hooks/useAutomations";
import { useDispatch } from "react-redux";
import { setActiveCanvasChat } from "@/src/stores/chatSlice";
import {
    deriveAppletName,
    launchAppletGeneration,
} from "@/src/utils/appletGeneration";
import GenerateHtmlDialog from "@/src/components/chat/canvas/GenerateHtmlDialog";
import { useAddChat } from "../../queries/chats";
import { useCurrentUser } from "../../queries/users";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    useCurrentUserDigest,
    useUpdateCurrentUserDigest,
} from "../../queries/digest";
import DigestBlock, { FullscreenBlock } from "./DigestBlock";
import EditDigestBlock from "./EditDigestBlock";
import CreateAutomationDialog from "@/src/components/automations/CreateAutomationDialog";
import HomeFullscreenDialog from "./HomeFullscreenDialog";
import HomeAddDialog from "./HomeAddDialog";
import HomeAppletWidget, { HomeAppletViewer } from "./HomeAppletWidget";
import HomeModifyAppletDialog from "./HomeModifyAppletDialog";
import useHomeViewNavigation from "./useHomeViewNavigation";
import { generateAppletHtmlFromPrompt } from "./generateAppletHtml";

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
    // Digests are deprecated: never seed a digest card into the default layout
    // (brand-new users have an empty default digest block). Automations still
    // appear; user-configured digests still render via resolveHomeItems for
    // backwards compatibility.
    const automationItems = (Array.isArray(blocks) ? blocks : [])
        .map((block, index) => {
            const blockId = toIdString(block?._id || block?.id);
            if (!blockId || !block.automationId) return null;
            return {
                type: "automation",
                blockId,
                automationId: toIdString(block.automationId),
                size: "large",
                order: index + 1,
            };
        })
        .filter(Boolean);
    const appletItems = (Array.isArray(applets) ? applets : []).map(
        (applet, index) => ({
            type: "applet",
            appletId: applet.appletId,
            size: "large",
            order: index + automationItems.length + 1,
        }),
    );

    // Nothing to show yet → render the empty state (not a lone empty group).
    if (automationItems.length === 0 && appletItems.length === 0) {
        return [];
    }

    return [
        createDefaultHomeGroup(defaultTitle),
        ...automationItems,
        ...appletItems,
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

function createClientId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mergeCreatingAppletsIntoSections(sections, creatingApplets) {
    if (!creatingApplets?.length) return sections;

    const byGroup = new Map();
    creatingApplets.forEach((entry) => {
        const key = entry.groupId || "__orphan__";
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key).push(entry);
    });

    let nextSections = sections.map((section) => {
        const groupKey = section.group?.groupId
            ? section.group.groupId
            : "__orphan__";
        const pending = byGroup.get(groupKey) || [];
        if (pending.length) {
            byGroup.delete(groupKey);
        }
        return pending.length
            ? { ...section, creatingApplets: pending }
            : section;
    });

    // Place leftovers on the last named group, or invent a temporary group.
    for (const [groupKey, pending] of byGroup.entries()) {
        if (!pending.length) continue;
        if (groupKey === "__orphan__" && nextSections.length > 0) {
            const last = nextSections[nextSections.length - 1];
            nextSections = [
                ...nextSections.slice(0, -1),
                {
                    ...last,
                    creatingApplets: [
                        ...(last.creatingApplets || []),
                        ...pending,
                    ],
                },
            ];
            continue;
        }
        nextSections = [
            ...nextSections,
            {
                group:
                    groupKey === "__orphan__"
                        ? null
                        : {
                              type: "group",
                              groupId: groupKey,
                              title: pending[0]?.groupTitle || "Home",
                          },
                items: [],
                creatingApplets: pending,
            },
        ];
    }

    return nextSections;
}

function getItemGridClass(item) {
    if (item.size === "mini") {
        return "sm:col-span-1 lg:col-span-3 h-40";
    }
    // Widget HTML is designed for a 320px viewport. Reserve another 56px for
    // the shared card header and 2px for the border instead of shrinking it.
    return "sm:col-span-2 lg:col-span-6 h-[378px]";
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
            return t("This task is no longer available.");
        }
        const run = block.automationRun;
        if (!run)
            return t("No report yet. It will appear here after the task runs.");
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

function HomeWidgetDialogShell({ title, onClose, children }) {
    return (
        <HomeFullscreenDialog compact title={title} onClose={onClose}>
            <div className="overflow-y-auto p-4">{children}</div>
        </HomeFullscreenDialog>
    );
}

function AddHomeAutomationDialog({
    isPending,
    onAdd,
    onCreateNew,
    onClose,
    t,
}) {
    const { data: automations } = useAutomations();
    const list = Array.isArray(automations) ? automations : [];
    const [automationId, setAutomationId] = useState(null);
    const [title, setTitle] = useState("");
    const [titleEdited, setTitleEdited] = useState(false);

    const selected =
        list.find((a) => String(a._id) === String(automationId)) || null;

    // Auto-populate the widget title from the automation's name until the user
    // types their own.
    useEffect(() => {
        if (selected && !titleEdited) {
            setTitle(selected.name || "");
        }
    }, [selected, titleEdited]);

    const canAdd = Boolean(automationId);
    const handleAdd = () =>
        onAdd({
            automationId,
            title: title.trim() || selected?.name || "",
            prompt: "",
        });

    return (
        <HomeWidgetDialogShell
            title={t("Add a report")}
            titleId="home-add-automation-title"
            onClose={onClose}
            t={t}
        >
            <div className="flex min-h-0 flex-col gap-4 text-start">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t(
                        "Reports show the latest results from your colleagues’ tasks.",
                    )}
                </p>
                <div className="space-y-1.5">
                    <Label className="text-xs">{t("Report")}</Label>
                    <Select
                        value={automationId ? String(automationId) : undefined}
                        onValueChange={(value) => setAutomationId(value)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={t("Choose a task…")} />
                        </SelectTrigger>
                        <SelectContent>
                            {list.map((automation) => (
                                <SelectItem
                                    key={String(automation._id)}
                                    value={String(automation._id)}
                                >
                                    {automation.name || t("Untitled")}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {automationId ? (
                    <div className="space-y-1.5">
                        <Label className="text-xs">{t("Title")}</Label>
                        <Input
                            value={title}
                            onChange={(event) => {
                                setTitle(event.target.value);
                                setTitleEdited(true);
                            }}
                            placeholder={t("Title (optional)")}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t("This card shows the latest task result.")}
                        </p>
                    </div>
                ) : null}

                <div className="relative flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                    <span className="text-xs uppercase text-gray-400 dark:text-gray-500">
                        {t("or")}
                    </span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                </div>

                <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                    disabled={isPending}
                    onClick={onCreateNew}
                >
                    <Sparkles className="h-4 w-4" />
                    {t("New task")}
                </button>

                <div className="mt-2 flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                        onClick={handleAdd}
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Check className="h-4 w-4" />
                        )}
                        {t("OK")}
                    </button>
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
    const homeNavigation = useHomeViewNavigation();
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const {
        startTour,
        isTourCompleted,
        isActive: isTourActive,
        currentStep: tourStep,
    } = useTour();
    const { data: digest, isLoading: isDigestLoading } = useCurrentUserDigest();
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
    const [pendingKey, setPendingKey] = useState(null);
    const addDialogOpen = homeNavigation.view === "add";
    const addDialogGroupId = addDialogOpen ? homeNavigation.itemId : null;
    const [addAutomationTarget, setAddAutomationTarget] = useState(null);
    const automationCreateOpen = homeNavigation.view === "create-task";
    const [automationCreateInitialPrompt, setAutomationCreateInitialPrompt] =
        useState("");
    const showCustomHomeDialog = homeNavigation.view === "custom";
    const [showCreateAppletDialog, setShowCreateAppletDialog] = useState(false);
    const [creatingApplets, setCreatingApplets] = useState([]);
    const creatingAppletsRef = useRef([]);
    const layoutItemsRef = useRef([]);
    const homeItemsMutationQueueRef = useRef(Promise.resolve());

    const openAddDialog = (groupId = null) => {
        homeNavigation.open("add", groupId);
    };
    const dispatch = useDispatch();
    const addChat = useAddChat();
    const { data: user } = useCurrentUser();
    const [activeDragKey, setActiveDragKey] = useState(null);
    const [scrollTargetKey, setScrollTargetKey] = useState(null);
    const editingWidgetKey =
        homeNavigation.view === "edit" ? homeNavigation.itemId : null;
    const [appletReloadToken, setAppletReloadToken] = useState(0);
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
    layoutItemsRef.current = layoutItems;
    creatingAppletsRef.current = creatingApplets;
    const resolvedItems = useMemo(
        () => resolveHomeItems(layoutItems, digestBlocks, homeApplets),
        [digestBlocks, homeApplets, layoutItems],
    );
    const homeSections = useMemo(
        () =>
            mergeCreatingAppletsIntoSections(
                buildHomeSections(resolvedItems),
                creatingApplets,
            ),
        [creatingApplets, resolvedItems],
    );
    const homeAppletIds = useMemo(
        () =>
            resolvedItems
                .filter((item) => item.type === "applet")
                .map((item) => item.appletId),
        [resolvedItems],
    );
    const homeAutomationIds = useMemo(
        () =>
            resolvedItems
                .filter((item) => item.type === "automation")
                .map((item) => item.automationId)
                .filter(Boolean),
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

    const modifyingApplet =
        editingWidget?.type === "applet" ? editingWidget : null;
    const openedItem =
        homeNavigation.view === "open"
            ? resolvedItems.find(
                  (item) => createItemKey(item) === homeNavigation.itemId,
              )
            : null;
    const previousHomeView = useRef(homeNavigation.view);
    useEffect(() => {
        if (
            previousHomeView.current === "edit" &&
            homeNavigation.view !== "edit"
        ) {
            setAppletReloadToken((token) => token + 1);
        }
        previousHomeView.current = homeNavigation.view;
    }, [homeNavigation.view]);
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
    const isHomeEmpty =
        resolvedItems.length === 0 && creatingApplets.length === 0;
    const hasSingleGroup = homeSections.filter((s) => s.group).length === 1;
    // Digest/automation content is fetched client-side. Until it resolves, an
    // unconfigured or automation-only layout looks empty — show a loading
    // placeholder instead of the empty state / "this group is empty" flash.
    const isContentLoading = isDigestLoading;
    const firstGroupSectionIndex = useMemo(
        () => homeSections.findIndex((s) => s.group),
        [homeSections],
    );

    const startHomeTour = useCallback(() => {
        startTour({
            id: "home",
            steps: getHomeTourSteps({ isEmpty: isHomeEmpty, t }),
        });
    }, [startTour, isHomeEmpty, t]);

    // Auto-start the Home tour on the user's first visit. Wait for the digest
    // query so we know whether the dashboard is empty or populated before
    // choosing the step path.
    const tourAutoStartedRef = useRef(false);
    useEffect(() => {
        if (tourAutoStartedRef.current) return;
        if (isDigestLoading) return;
        tourAutoStartedRef.current = true;
        if (isTourActive || isTourCompleted("home")) return;
        startHomeTour();
    }, [isDigestLoading, isTourActive, isTourCompleted, startHomeTour]);

    // While the tour runs, mirror edit mode to the active step so edit-only
    // anchors (Add group / Add item) exist when they're highlighted.
    useEffect(() => {
        if (!isTourActive) return;
        setIsEditing(tourStep?.requires === "edit");
    }, [isTourActive, tourStep]);

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
    }, [creatingApplets, resolvedItems, scrollTargetKey]);

    const enqueueHomeItemsMutation = (mutator) => {
        const run = homeItemsMutationQueueRef.current.then(mutator, mutator);
        homeItemsMutationQueueRef.current = run.catch(() => {});
        return run;
    };

    const saveHomeItems = async (nextItems) => {
        const serialized = serializeHomeItems(nextItems);
        const response = await fetch("/api/users/me/home-items", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                homeItems: serialized,
                // A pending/failed digest query cannot acknowledge cards that
                // resolveHomeItems has not been able to display yet.
                legacyDigestsIncluded: Array.isArray(digest?.blocks),
            }),
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
        // Keep the mutation queue coherent across overlapping creates/pins.
        layoutItemsRef.current = savedItems;
        return savedItems;
    };

    // Reuses the shared applet-generation flow: create a chat, kick off
    // generation, and open the builder (same as the Applets library).
    const handleCreateApplet = async (prompt) => {
        if (!user?.contextId) {
            toast.error(t("Unable to create file: User context not available"));
            return;
        }
        setShowCreateAppletDialog(false);
        let chatId;
        let appletName;
        try {
            appletName = deriveAppletName(prompt);
            const chat = await addChat.mutateAsync({
                messages: [],
                title: appletName || t("New app"),
            });
            chatId = toIdString(chat?._id);
            if (!chatId) throw new Error("Chat creation returned no id");
            dispatch(setActiveCanvasChat(chatId));
        } catch (error) {
            console.error("Error creating applet chat:", error);
            toast.error(
                error.message || t("Failed to create chat. Please try again."),
            );
            return;
        }
        const { completion } = launchAppletGeneration({
            prompt,
            dispatch,
            userContextId: user.contextId,
            appletName,
            onError: (error) => {
                console.error("Error generating applet:", error);
                toast.error(
                    error.message ||
                        t("Couldn't create this app. Please try again."),
                );
            },
        });
        void completion.catch(() => {});
        router.push(`/chat/${chatId}`);
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

    const buildEmptyHomeSeed = (groupId = null) => {
        if (groupId || !isHomeEmpty) {
            return { groupId: groupId || null, seedItems: [] };
        }
        const newGroupId = createGroupId();
        return {
            groupId: newGroupId,
            seedItems: [
                {
                    type: "group",
                    groupId: newGroupId,
                    title: t("New group"),
                },
            ],
        };
    };

    const pinAppletsToHome = async (
        selectedApplets = [],
        groupId = null,
        { lockUi = false, size = "large" } = {},
    ) => {
        if (!selectedApplets.length) return;
        const pinSize = size === "mini" ? "mini" : "large";

        try {
            if (lockUi) {
                setPendingKey("commit");
            }
            await enqueueHomeItemsMutation(async () => {
                const { groupId: targetGroupId, seedItems } =
                    buildEmptyHomeSeed(groupId);
                const baseItems = (layoutItemsRef.current || []).map(
                    ({ block, applet, ...entry }) => entry,
                );
                const appletItems = selectedApplets.map((applet) => ({
                    type: "applet",
                    appletId: applet.appletId,
                    size: pinSize,
                }));
                let nextItems;
                if (seedItems.length) {
                    nextItems = [...baseItems, ...seedItems, ...appletItems];
                } else {
                    const insertIndex = getInsertIndexForGroup(
                        baseItems,
                        targetGroupId,
                    );
                    nextItems = [
                        ...baseItems.slice(0, insertIndex),
                        ...appletItems.map((item, index) => ({
                            ...item,
                            order: insertIndex + index,
                        })),
                        ...baseItems.slice(insertIndex),
                    ];
                }
                await saveHomeItems(nextItems);
                const lastItem = nextItems[nextItems.length - 1];
                if (lastItem?.type === "applet") {
                    setScrollTargetKey(createItemKey(lastItem));
                }
                setHomeApplets((current) => [
                    ...current,
                    ...selectedApplets.filter(
                        (applet) =>
                            !current.some(
                                (item) => item.appletId === applet.appletId,
                            ),
                    ),
                ]);
            });
        } catch (error) {
            console.error("Error adding home applet:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
        } finally {
            if (lockUi) {
                setPendingKey(null);
            }
        }
    };

    const handleAddApplets = async (
        { applets: selectedApplets = [] },
        groupId = null,
        size = "large",
    ) => {
        // Existing-applet picks may briefly mark commit pending for drag/edit
        // affordances, but Add menus stay enabled (see HomeGroupAddMenu).
        await pinAppletsToHome(selectedApplets, groupId, {
            lockUi: false,
            size,
        });
    };

    const commitAutomationWithOptionalGroup = async (block, groupId = null) => {
        const { groupId: targetGroupId, seedItems } =
            buildEmptyHomeSeed(groupId);
        const pendingType = "automation";
        try {
            setPendingKey(createGroupAddPendingKey(pendingType, targetGroupId));
            const blockPayload = {
                title: block?.title?.trim() || "",
                prompt: block?.prompt?.trim() || "",
            };
            const normalizedAutomationId = toIdString(block?.automationId);
            if (normalizedAutomationId) {
                blockPayload.automationId = normalizedAutomationId;
            }
            const nextDigest = await updateDigest.mutateAsync({
                blocks: [...digestBlocks, blockPayload],
            });
            setLocalDigestBlocks(nextDigest?.blocks || digestBlocks);
            const digestBlock = [...(nextDigest?.blocks || [])].at(-1);
            const blockId = toIdString(digestBlock?._id || digestBlock?.id);
            if (!blockId) {
                return;
            }
            const automationItem = {
                type: "automation",
                blockId,
                ...(normalizedAutomationId
                    ? { automationId: normalizedAutomationId }
                    : {}),
                size: "large",
            };
            if (seedItems.length) {
                const baseItems = resolvedItems.map(
                    ({ block: _block, applet, ...entry }) => entry,
                );
                await saveHomeItems([
                    ...baseItems,
                    ...seedItems,
                    automationItem,
                ]);
                setScrollTargetKey(createItemKey(automationItem));
            } else {
                await addResolvedItem(automationItem, {
                    groupId: targetGroupId,
                });
            }
        } catch (error) {
            console.error("Error adding automation home item:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home layout. Please try again."),
            );
            throw error;
        } finally {
            setPendingKey(null);
        }
    };

    const handleAutomationDialogAdd = async (block) => {
        if (!addAutomationTarget || !block?.automationId) {
            return;
        }
        const { groupId } = addAutomationTarget;
        try {
            await commitAutomationWithOptionalGroup(block, groupId);
            setAddAutomationTarget(null);
        } catch {
            // Error toast already shown.
        }
    };

    const handleAutomationCreated = async (created) => {
        const groupId = addAutomationTarget?.groupId ?? null;
        try {
            await commitAutomationWithOptionalGroup(
                {
                    title: created?.name || "",
                    prompt: "",
                    automationId: created?._id,
                },
                groupId,
            );
            setAddAutomationTarget(null);
            homeNavigation.close();
            setAutomationCreateInitialPrompt("");
        } catch {
            // Error toast already shown.
        }
    };

    const handlePickExistingApplet = async (
        applet,
        groupId = null,
        size = "large",
    ) => {
        await handleAddApplets({ applets: [applet] }, groupId, size);
    };

    const handlePickExistingAutomation = async (automation, groupId = null) => {
        try {
            await commitAutomationWithOptionalGroup(
                {
                    title: automation?.name || "",
                    prompt: "",
                    automationId: automation?._id,
                },
                groupId,
            );
        } catch {
            // Error toast already shown.
        }
    };

    const handleCreateAppletFromPrompt = async (
        prompt,
        groupId = null,
        size = "large",
    ) => {
        const trimmed = String(prompt || "").trim();
        if (!trimmed) return;
        const pinSize = size === "mini" ? "mini" : "large";

        const clientId = createClientId();
        const appletName = deriveAppletName(trimmed);

        // Reuse an in-flight create's group so parallel creates on an empty
        // home share one seed group instead of racing to create several.
        const reuseGroupId =
            groupId ||
            creatingAppletsRef.current.find((entry) => entry.groupId)
                ?.groupId ||
            null;
        const { groupId: targetGroupId, seedItems } =
            buildEmptyHomeSeed(reuseGroupId);

        if (seedItems.length) {
            try {
                await enqueueHomeItemsMutation(async () => {
                    const baseItems = (layoutItemsRef.current || []).map(
                        ({ block, applet, ...entry }) => entry,
                    );
                    await saveHomeItems([...baseItems, ...seedItems]);
                });
            } catch (error) {
                console.error("Error seeding home group:", error);
                toast.error(
                    error.message ||
                        t("Failed to update Home layout. Please try again."),
                );
                return;
            }
        }

        setCreatingApplets((current) => {
            const next = [
                ...current,
                {
                    clientId,
                    name: appletName,
                    groupId: targetGroupId,
                    groupTitle: t("New group"),
                    size: pinSize,
                    status: "generating",
                    error: null,
                },
            ];
            creatingAppletsRef.current = next;
            return next;
        });
        setScrollTargetKey(`creating:${clientId}`);

        try {
            const html = await generateAppletHtmlFromPrompt(trimmed, t);
            setCreatingApplets((current) => {
                const next = current.map((entry) =>
                    entry.clientId === clientId
                        ? { ...entry, status: "saving" }
                        : entry,
                );
                creatingAppletsRef.current = next;
                return next;
            });

            const createRes = await fetch("/api/canvas-applets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: appletName, html }),
            });
            if (!createRes.ok) {
                throw new Error(t("Couldn't save this app. Please try again."));
            }
            const created = await createRes.json();
            const appletId = toIdString(created?._id);
            if (!appletId) {
                throw new Error(t("Applet ID missing"));
            }

            const appletMeta = {
                appletId,
                name: created.name || appletName,
                slug: created.slug,
                description: created.description,
                updatedAt: created.updatedAt || new Date().toISOString(),
            };

            setCreatingApplets((current) => {
                const next = current.filter(
                    (entry) => entry.clientId !== clientId,
                );
                creatingAppletsRef.current = next;
                return next;
            });
            // Never lock Add during generate/pin — multiple creates can overlap.
            await pinAppletsToHome([appletMeta], targetGroupId, {
                lockUi: false,
                size: pinSize,
            });
        } catch (error) {
            console.error("Error creating home applet from prompt:", error);
            setCreatingApplets((current) => {
                const next = current.filter(
                    (entry) => entry.clientId !== clientId,
                );
                creatingAppletsRef.current = next;
                return next;
            });
            toast.error(
                error.message ||
                    t("Couldn't create this app. Please try again."),
            );
        }
    };

    const handleCreateAutomationFromPrompt = (prompt, groupId = null) => {
        setAddAutomationTarget({ groupId });
        setAutomationCreateInitialPrompt(prompt || "");
        homeNavigation.open("create-task");
    };

    const addAutomationPendingKey = addAutomationTarget
        ? createGroupAddPendingKey("automation", addAutomationTarget.groupId)
        : null;

    return (
        <main
            className={cn(
                "min-h-full bg-gray-50 px-4 py-4 dark:bg-gray-900 sm:px-6 lg:px-8",
                isEditing && "pe-11 sm:pe-12 lg:pe-14",
            )}
            dir={direction}
        >
            <div className="relative mx-auto max-w-7xl">
                <PageHeader title={t("Home")}>
                    {isEditing ? (
                        <>
                            <HeaderAction
                                icon={
                                    pendingKey === "add:group" ? Loader2 : Plus
                                }
                                label={t("Add group")}
                                variant="default"
                                data-tour="home-add-group"
                                onClick={handleAddGroup}
                                disabled={Boolean(pendingKey)}
                            />
                            <HeaderAction
                                icon={Check}
                                label={t("Done")}
                                onClick={() => setIsEditing(false)}
                                disabled={Boolean(pendingKey)}
                            />
                        </>
                    ) : (
                        <HomeDashboardActions
                            onAdd={() => openAddDialog(null)}
                            onEdit={() => setIsEditing(true)}
                            onUseCustomHome={() =>
                                homeNavigation.open("custom")
                            }
                            onTakeTour={startHomeTour}
                            disabled={Boolean(pendingKey)}
                            t={t}
                        />
                    )}
                </PageHeader>

                <div>
                    {isContentLoading && isHomeEmpty ? (
                        <HomeLoadingPlaceholder t={t} />
                    ) : isHomeEmpty ? (
                        <HomePageEmptyState
                            onOpenAdd={() => openAddDialog(null)}
                            t={t}
                        />
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
                                    {homeSections.map(
                                        (section, sectionIndex) => (
                                            <HomeGroupSection
                                                key={
                                                    section.group
                                                        ? createItemKey(
                                                              section.group,
                                                          )
                                                        : `section-${sectionIndex}`
                                                }
                                                section={section}
                                                isEditing={isEditing}
                                                pendingKey={pendingKey}
                                                isDragDisabled={
                                                    !isEditing ||
                                                    Boolean(pendingKey)
                                                }
                                                isGroupDragActive={
                                                    isGroupDragActive
                                                }
                                                isItemDragActive={
                                                    isItemDragActive
                                                }
                                                isContentLoading={
                                                    isContentLoading
                                                }
                                                onOpen={(item) =>
                                                    homeNavigation.open(
                                                        "open",
                                                        createItemKey(item),
                                                    )
                                                }
                                                onRemove={handleRemove}
                                                onRenameGroup={
                                                    handleRenameGroup
                                                }
                                                onResize={handleResize}
                                                onEditWidget={(item) =>
                                                    homeNavigation.open(
                                                        "edit",
                                                        createItemKey(item),
                                                    )
                                                }
                                                onModifyApplet={(item) =>
                                                    homeNavigation.open(
                                                        "edit",
                                                        createItemKey(item),
                                                    )
                                                }
                                                appletReloadToken={
                                                    appletReloadToken
                                                }
                                                registerItemNode={
                                                    registerItemNode
                                                }
                                                onOpenAdd={openAddDialog}
                                                addMenuDataTour={
                                                    sectionIndex ===
                                                    firstGroupSectionIndex
                                                        ? "home-add-item"
                                                        : undefined
                                                }
                                                hideTitle={hasSingleGroup}
                                                t={t}
                                            />
                                        ),
                                    )}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </div>

            {openedItem?.type === "applet" ? (
                <HomeAppletViewer
                    applet={openedItem.applet}
                    onClose={homeNavigation.close}
                />
            ) : openedItem?.block ? (
                <FullscreenBlock
                    block={openedItem.block}
                    onClose={homeNavigation.close}
                />
            ) : null}
            {addDialogOpen ? (
                <HomeAddDialog
                    excludedAppletIds={homeAppletIds}
                    excludedAutomationIds={homeAutomationIds}
                    onPickApplet={async (applet, { size } = {}) => {
                        homeNavigation.close();
                        await handlePickExistingApplet(
                            applet,
                            addDialogGroupId,
                            size,
                        );
                    }}
                    onPickAutomation={async (automation) => {
                        homeNavigation.close();
                        await handlePickExistingAutomation(
                            automation,
                            addDialogGroupId,
                        );
                    }}
                    onCreateApplet={(prompt, { size } = {}) => {
                        const groupId = addDialogGroupId;
                        homeNavigation.close();
                        void handleCreateAppletFromPrompt(
                            prompt,
                            groupId,
                            size,
                        );
                    }}
                    onCreateAutomation={(prompt) => {
                        handleCreateAutomationFromPrompt(
                            prompt,
                            addDialogGroupId,
                        );
                    }}
                    onClose={() => homeNavigation.close()}
                    t={t}
                />
            ) : null}

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
                                homeNavigation.close();
                            }
                        }}
                        onClose={() => homeNavigation.close()}
                        t={t}
                    />
                )}

            {modifyingApplet?.type === "applet" ? (
                <HomeModifyAppletDialog
                    applet={
                        modifyingApplet.applet || {
                            appletId: modifyingApplet.appletId,
                            name: modifyingApplet.title,
                        }
                    }
                    viewMode={
                        modifyingApplet.size === "mini" ? "draft" : "widget"
                    }
                    onClose={homeNavigation.close}
                    t={t}
                />
            ) : null}

            {addAutomationTarget && homeNavigation.view === "pick-task" ? (
                <AddHomeAutomationDialog
                    isPending={pendingKey === addAutomationPendingKey}
                    onAdd={handleAutomationDialogAdd}
                    onCreateNew={() => homeNavigation.open("create-task")}
                    onClose={() => {
                        setAddAutomationTarget(null);
                        homeNavigation.close();
                        setAutomationCreateInitialPrompt("");
                    }}
                    t={t}
                />
            ) : null}

            <CreateAutomationDialog
                open={automationCreateOpen}
                onOpenChange={(open) => {
                    if (!open) homeNavigation.close();
                    if (!open) {
                        setAutomationCreateInitialPrompt("");
                        setAddAutomationTarget(null);
                    }
                }}
                onCreated={handleAutomationCreated}
                initialPrompt={automationCreateInitialPrompt}
            />

            {showCustomHomeDialog && (
                <HomeCustomAppletDialog
                    onClose={() => homeNavigation.close()}
                    t={t}
                />
            )}

            <GenerateHtmlDialog
                show={showCreateAppletDialog}
                onHide={() => setShowCreateAppletDialog(false)}
                onGenerate={handleCreateApplet}
            />
        </main>
    );
}

function HomeDashboardActions({
    onAdd,
    onEdit,
    onUseCustomHome,
    onTakeTour,
    disabled,
    t,
}) {
    return (
        <>
            <HeaderAction
                icon={Plus}
                label={t("Add to Home")}
                variant="default"
                onClick={onAdd}
            />
            <HeaderAction
                icon={Pencil}
                label={t("Arrange")}
                data-tour="home-menu"
                onClick={onEdit}
                disabled={disabled}
            />
            <HeaderAction
                icon={LayoutGrid}
                label={t("Custom home page")}
                onClick={onUseCustomHome}
                disabled={disabled}
            />
            <HeaderAction
                icon={Compass}
                label={t("Take a tour")}
                variant="ghost"
                onClick={onTakeTour}
            />
        </>
    );
}

function HomeMenuItem({
    onClick,
    icon: Icon,
    children,
    danger = false,
    testId,
    disabled = false,
}) {
    return (
        <Menu.Item disabled={disabled}>
            {({ active }) => (
                <button
                    type="button"
                    onClick={onClick}
                    data-testid={testId}
                    disabled={disabled}
                    className={cn(
                        "flex min-h-10 w-full items-center gap-2 px-3 text-start text-sm",
                        danger
                            ? active
                                ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                                : "text-red-600 dark:text-red-400"
                            : active
                              ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                              : "text-gray-700 dark:text-gray-200",
                    )}
                >
                    {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                    {children}
                </button>
            )}
        </Menu.Item>
    );
}

function HomeTileMenu({
    item,
    isPending,
    onRemove,
    onResize,
    onEdit,
    onModify,
    t,
    onOpen,
    onRefresh,
    refreshLabel,
    refreshDisabled,
    onChat,
}) {
    const isApplet = item.type === "applet";
    const isLaunch = item.size === "mini";
    const resizeLabel = isApplet
        ? isLaunch
            ? t("Use on Home")
            : t("Show as shortcut")
        : isLaunch
          ? t("Show full card")
          : t("Show summary");
    const ResizeIcon = isLaunch ? Maximize2 : Minimize2;

    return (
        <Menu as="div" className="relative">
            <Menu.Button
                data-testid="home-tile-menu"
                disabled={isPending}
                title={t("Card options")}
                aria-label={t("Card options")}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/90 text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:bg-gray-800/90 dark:text-gray-300 dark:hover:bg-gray-700"
            >
                {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <MoreVertical className="h-4 w-4" />
                )}
            </Menu.Button>
            <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
            >
                <Menu.Items className="absolute end-0 z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] origin-top-end rounded-lg border border-gray-200 bg-white py-1 shadow-lg focus:outline-none dark:border-gray-600 dark:bg-gray-800">
                    <HomeMenuItem onClick={() => onOpen?.()} icon={Maximize2}>
                        {t(isApplet ? "Open app" : "Open report")}
                    </HomeMenuItem>
                    <HomeMenuItem
                        onClick={() => onResize?.(item)}
                        icon={ResizeIcon}
                        testId="home-tile-menu-resize"
                    >
                        {resizeLabel}
                    </HomeMenuItem>
                    {isApplet ? (
                        <HomeMenuItem
                            onClick={() => onModify?.(item)}
                            icon={Sparkles}
                            testId="home-tile-menu-modify"
                        >
                            {t("Edit")}
                        </HomeMenuItem>
                    ) : (
                        <HomeMenuItem
                            onClick={() => onEdit?.(item)}
                            icon={Pencil}
                            testId="home-tile-menu-edit"
                        >
                            {t("Edit")}
                        </HomeMenuItem>
                    )}
                    {onRefresh && (
                        <HomeMenuItem
                            onClick={onRefresh}
                            icon={RefreshCw}
                            disabled={refreshDisabled}
                        >
                            {refreshLabel}
                        </HomeMenuItem>
                    )}
                    {onChat && (
                        <HomeMenuItem onClick={onChat} icon={MessageSquare}>
                            {t("Open in chat")}
                        </HomeMenuItem>
                    )}
                    <HomeMenuItem
                        onClick={() => onRemove?.(item)}
                        icon={Trash2}
                        danger
                        testId="home-tile-menu-remove"
                    >
                        {t("Remove from Home")}
                    </HomeMenuItem>
                </Menu.Items>
            </Transition>
        </Menu>
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

function HomeCreatingAppletCard({ name, status, t }) {
    const statusLabel =
        status === "saving" ? t("Saving...") : t("Getting your app ready…");

    return (
        <div
            data-testid="home-creating-applet-card"
            className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-sky-300 bg-sky-50/70 px-4 text-center dark:border-sky-800 dark:bg-sky-950/30"
        >
            <Loader2 className="h-6 w-6 animate-spin text-sky-600 dark:text-sky-400" />
            <div className="space-y-1">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {name || t("New app")}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    {statusLabel}
                </div>
            </div>
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
    onModifyApplet,
    appletReloadToken = 0,
    registerItemNode,
    onOpenAdd,
    addMenuDataTour,
    isContentLoading = false,
    hideTitle = false,
    t,
}) {
    const { group, items } = section;
    const creatingApplets = section.creatingApplets || [];
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
                    "group/card relative overflow-visible rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] dark:border-gray-700/90 dark:bg-gray-800 dark:ring-white/[0.06]",
                    items.length === 0 &&
                        creatingApplets.length === 0 &&
                        "min-h-20 border-dashed bg-gray-50/70 dark:bg-gray-900/50",
                    isEditing &&
                        (items.length > 0 || creatingApplets.length > 0) &&
                        "ring-1 ring-gray-200/60 dark:ring-gray-700/60",
                    isGroupDragging && "z-30 opacity-60",
                )}
            >
                {isEditing && !hideTitle && (
                    <DragHandle
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
                {/* Quick-add stays visible in the group header.
                    Stay available while placeholders generate so users can start
                    another create in parallel. */}
                {!isEditing &&
                    (items.length > 0 || creatingApplets.length > 0) && (
                        <div className="absolute end-1.5 top-1.5 z-20">
                            <HomeGroupAddMenu
                                groupId={groupId}
                                onOpenAdd={onOpenAdd}
                                compact
                                t={t}
                            />
                        </div>
                    )}
                <HomeGroupTitle
                    item={group}
                    isEditing={isEditing}
                    isPending={isGroupPending}
                    onRename={onRenameGroup}
                    hasContentBelow={
                        items.length > 0 ||
                        creatingApplets.length > 0 ||
                        isEditing
                    }
                    hideTitle={hideTitle}
                    t={t}
                />
                <GroupItemsDropZone
                    dropId={`group-drop:${groupId}`}
                    isDisabled={isDragDisabled || isGroupDragActive}
                    isActive={isItemDragActive}
                    className={cn(
                        items.length === 0 &&
                            creatingApplets.length === 0 &&
                            "min-h-20",
                    )}
                >
                    {items.length > 0 || creatingApplets.length > 0 ? (
                        <SortableContext
                            items={itemSortableIds}
                            strategy={rectSortingStrategy}
                        >
                            <div className="grid grid-cols-1 gap-x-3 gap-y-6 p-3 pt-5 sm:grid-cols-2 lg:grid-cols-12">
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
                                        onModifyApplet={onModifyApplet}
                                        appletReloadToken={appletReloadToken}
                                        registerItemNode={registerItemNode}
                                        t={t}
                                    />
                                ))}
                                {creatingApplets.map((entry) => (
                                    <CreatingAppletGridItem
                                        key={`creating:${entry.clientId}`}
                                        entry={entry}
                                        registerItemNode={registerItemNode}
                                        t={t}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    ) : isContentLoading ? (
                        <div className="px-3 pt-1 pb-3">
                            <div className="flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t("Loading...")}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 px-3 pt-1 pb-3">
                            <EmptyAddState label={t("This group is empty.")} />
                            <div className="flex justify-center">
                                <HomeGroupAddMenu
                                    groupId={groupId}
                                    onOpenAdd={onOpenAdd}
                                    dataTour={addMenuDataTour}
                                    t={t}
                                />
                            </div>
                        </div>
                    )}
                    {isEditing &&
                    (items.length > 0 || creatingApplets.length > 0) ? (
                        <div className="flex justify-center border-t border-dashed border-gray-200 p-3 dark:border-gray-700">
                            <HomeGroupAddMenu
                                groupId={groupId}
                                onOpenAdd={onOpenAdd}
                                dataTour={addMenuDataTour}
                                t={t}
                            />
                        </div>
                    ) : null}
                </GroupItemsDropZone>
            </div>
        </section>
    );
}

function CreatingAppletGridItem({ entry, registerItemNode, t }) {
    const itemKey = `creating:${entry.clientId}`;
    const setNodeRef = useCallback(
        (node) => {
            registerItemNode?.(itemKey, node);
        },
        [itemKey, registerItemNode],
    );

    return (
        <div
            ref={setNodeRef}
            data-creating-applet={entry.clientId}
            className={getItemGridClass({
                type: "applet",
                size: entry.size === "mini" ? "mini" : "large",
            })}
        >
            <HomeCreatingAppletCard
                name={entry.name}
                status={entry.status}
                t={t}
            />
        </div>
    );
}

const homeEditIconButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/75 text-gray-500 shadow-sm backdrop-blur-sm ring-1 ring-black/[0.06] transition hover:bg-white hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900/70 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-gray-800 dark:hover:text-gray-100 dark:focus:ring-sky-900/40";

const homeEditDangerIconButtonClass =
    "hover:bg-red-50/90 hover:text-red-500 dark:hover:bg-red-950/70 dark:hover:text-red-400";

function HomeGroupAddMenu({
    groupId,
    disabled = false,
    onOpenAdd,
    dataTour,
    compact = false,
    className,
    t,
}) {
    const openInitialMode = () => onOpenAdd?.(groupId);

    return (
        <>
            {compact ? (
                <button
                    type="button"
                    disabled={disabled}
                    aria-label={t("Add")}
                    title={t("Add")}
                    data-tour={dataTour}
                    data-testid="home-group-add"
                    onClick={openInitialMode}
                    className={cn(homeEditIconButtonClass, className)}
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    aria-label={t("Add")}
                    data-tour={dataTour}
                    data-testid="home-group-add"
                    onClick={openInitialMode}
                    className={cn(
                        appCatalogActionButtonClass,
                        appCatalogPrimaryActionButtonClass,
                        "min-h-10 min-w-[7.5rem] justify-center border-dashed",
                        className,
                    )}
                >
                    <Plus className="h-4 w-4" />
                    {t("Add")}
                </button>
            )}
        </>
    );
}

function HomeCustomAppletDialog({ onClose, t }) {
    const router = useRouter();
    const [prompt, setPrompt] = useState("");
    const [status, setStatus] = useState("idle"); // "idle" | "generating" | "saving" | "error"
    const [error, setError] = useState(null);
    const [existingApplets, setExistingApplets] = useState([]);
    const [isLoadingApplets, setIsLoadingApplets] = useState(true);
    const [isSettingHome, setIsSettingHome] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);

    useEffect(() => {
        const ac = new AbortController();
        const { signal } = ac;

        // Offer both the user's own applets and marketplace (store) applets as
        // ready-made home pages.
        Promise.all([
            fetch("/api/canvas-applets", { signal })
                .then((res) => (res.ok ? res.json() : { applets: [] }))
                .catch(() => ({ applets: [] })),
            fetch("/api/apps", { signal })
                .then((res) => (res.ok ? res.json() : []))
                .catch(() => []),
        ])
            .then(([ownData, storeData]) => {
                const own = (ownData.applets || [])
                    .filter((a) => a.version === 2)
                    .map((a) => ({
                        _id: String(a._id),
                        name: a.name,
                        app: a.app,
                    }));
                // `/api/apps` returns a bare array — not `{ apps: [...] }`.
                const store = getAppsCatalogList(storeData)
                    .filter((app) => app?.type === "applet")
                    .map((app) => {
                        const raw = app?.appletId;
                        const id =
                            raw && typeof raw === "object" ? raw?._id : raw;
                        if (!id) return null;
                        return {
                            _id: String(id),
                            name: raw?.name || app.name || t("Untitled app"),
                            app,
                        };
                    })
                    .filter(Boolean);
                const byId = new Map();
                [...own, ...store].forEach((a) => {
                    if (!byId.has(a._id)) byId.set(a._id, a);
                });
                setExistingApplets([...byId.values()]);
            })
            .catch(() => {})
            .finally(() => setIsLoadingApplets(false));

        fetch("/api/home-page-suggestions", { signal })
            .then((res) => (res.ok ? res.json() : { suggestions: [] }))
            .then((data) => setSuggestions(data.suggestions || []))
            .catch(() => {})
            .finally(() => setIsLoadingSuggestions(false));

        return () => ac.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const applyHomeApplet = async (appletId) => {
        const res = await fetch("/api/users/me/home-applet", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appletId: String(appletId) }),
        });
        if (!res.ok)
            throw new Error(
                t("Couldn't change your Home page. Please try again."),
            );
        onClose();
        router.refresh();
    };

    const handleSelectExisting = async (applet) => {
        const id = String(applet._id);
        setIsSettingHome(id);
        try {
            await applyHomeApplet(id);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setIsSettingHome(null);
        }
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setStatus("generating");
        setError(null);
        try {
            const genRes = await fetch("/api/generate-applet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: prompt.trim() }),
            });
            if (!genRes.ok || !genRes.body)
                throw new Error(t("Generation failed"));

            const reader = genRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let finalHtml = null;
            let accumulated = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const blocks = buffer.split("\n\n");
                buffer = blocks.pop() || "";
                for (const block of blocks) {
                    const line = block
                        .split("\n")
                        .find((l) => l.startsWith("data: "));
                    if (!line) continue;
                    let payload;
                    try {
                        payload = JSON.parse(line.slice(6));
                    } catch {
                        continue;
                    }
                    const { event, data } = payload || {};
                    if (event === "data" && data?.chunk) {
                        accumulated += data.chunk;
                    } else if (event === "complete" && data?.html) {
                        finalHtml = data.html;
                    } else if (event === "error") {
                        throw new Error(
                            data?.error || t("Applet generation failed"),
                        );
                    }
                }
            }

            const html = finalHtml || accumulated.trim();
            if (!html)
                throw new Error(
                    t("Couldn't create this app. Please try again."),
                );

            setStatus("saving");
            const name = prompt.trim().split(/\s+/).slice(0, 5).join(" ");
            const createRes = await fetch("/api/canvas-applets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, html }),
            });
            if (!createRes.ok)
                throw new Error(t("Couldn't save this app. Please try again."));
            const created = await createRes.json();
            if (!created?._id) throw new Error(t("Applet ID missing"));

            await applyHomeApplet(created._id);
        } catch (err) {
            setStatus("error");
            setError(err.message || t("Something went wrong"));
        }
    };

    const isBusy = status === "generating" || status === "saving";

    return (
        <HomeWidgetDialogShell
            title={t("Create a custom home page")}
            titleId="home-custom-applet-dialog"
            onClose={onClose}
            t={t}
        >
            <div className="space-y-6">
                <div className="space-y-3">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t(
                            "Describe what you want on your home page and we'll build it for you.",
                        )}
                    </p>
                    {isLoadingSuggestions ? (
                        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t("Loading suggestions...")}
                        </div>
                    ) : suggestions.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                            {suggestions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => setPrompt(suggestion)}
                                    className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100 disabled:pointer-events-none disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:border-sky-700 dark:hover:bg-sky-900/40"
                                >
                                    <Sparkles className="h-3 w-3 shrink-0" />
                                    <span>{suggestion}</span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={t(
                            "e.g., A dashboard with my schedule, latest news headlines, and weather",
                        )}
                        rows={3}
                        disabled={isBusy}
                        dir="auto"
                        className="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-400 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-500"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && e.ctrlKey) {
                                e.preventDefault();
                                handleGenerate();
                            }
                        }}
                    />
                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                            {error}
                        </p>
                    )}
                    <div className="flex justify-end">
                        <button
                            type="button"
                            disabled={!prompt.trim() || isBusy}
                            onClick={handleGenerate}
                            className="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {status === "generating" ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t("Generating...")}
                                </>
                            ) : status === "saving" ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t("Saving...")}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    {t("Generate & Set as Home")}
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Only surface the "existing applet" picker when the user
                    actually has applets (or we're still loading them). */}
                {(isLoadingApplets || existingApplets.length > 0) && (
                    <>
                        <div className="relative flex items-center gap-3">
                            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                            <span className="text-xs uppercase text-gray-400 dark:text-gray-500">
                                {t("or choose an existing app")}
                            </span>
                            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                        </div>

                        {isLoadingApplets ? (
                            <div className="flex justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                            </div>
                        ) : (
                            <div className="flex gap-3 overflow-x-auto pb-1">
                                {existingApplets.map((applet) => {
                                    const id = String(applet._id);
                                    const iconName = applet.app?.icon;
                                    const Icon =
                                        iconName && Icons[iconName]
                                            ? Icons[iconName]
                                            : AppWindow;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            disabled={
                                                Boolean(isSettingHome) || isBusy
                                            }
                                            onClick={() =>
                                                handleSelectExisting(applet)
                                            }
                                            className="flex min-w-[6rem] flex-col items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-center transition-colors hover:border-sky-300 hover:bg-sky-50 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-sky-700 dark:hover:bg-sky-950/30"
                                        >
                                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                                                {isSettingHome === id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                                                ) : (
                                                    <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                                )}
                                            </div>
                                            <span className="line-clamp-2 w-full text-xs font-medium text-gray-900 dark:text-gray-100">
                                                {applet.name}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </HomeWidgetDialogShell>
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
    onModifyApplet,
    appletReloadToken = 0,
    registerItemNode,
    t,
}) {
    const { items } = section;
    const creatingApplets = section.creatingApplets || [];
    const itemSortableIds = useMemo(() => items.map(createItemKey), [items]);
    if (items.length === 0 && creatingApplets.length === 0) {
        return null;
    }

    return (
        <section className="space-y-2">
            <div className="overflow-visible rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] dark:border-gray-700/90 dark:bg-gray-800 dark:ring-white/[0.06]">
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
                                    onModifyApplet={onModifyApplet}
                                    appletReloadToken={appletReloadToken}
                                    registerItemNode={registerItemNode}
                                    t={t}
                                />
                            ))}
                            {creatingApplets.map((entry) => (
                                <CreatingAppletGridItem
                                    key={`creating:${entry.clientId}`}
                                    entry={entry}
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
    onModifyApplet,
    appletReloadToken = 0,
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

    const tileMenu = !isEditing ? (
        <HomeTileMenu
            item={item}
            isPending={isPending}
            onRemove={onRemove}
            onResize={onResize}
            onEdit={
                item.type === "digest" || item.type === "automation"
                    ? () => onEditWidget?.(item)
                    : undefined
            }
            onModify={onModifyApplet}
            t={t}
            onOpen={onOpen}
        />
    ) : null;
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
                "relative overflow-visible",
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
            {!isEditing && item.type === "applet" && item.size === "mini" ? (
                <div
                    className="absolute end-1.5 top-1.5 z-30"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {tileMenu}
                </div>
            ) : null}
            <div
                data-testid="home-widget-surface"
                className={cn(
                    "h-full min-h-0",
                    isEditing && "pointer-events-none opacity-60",
                )}
            >
                {item.type === "applet" ? (
                    item.size === "mini" ? (
                        <HomeAppletMiniCard
                            applet={item.applet}
                            isEditing={isEditing}
                            isPending={isPending}
                            onOpen={onOpen}
                        />
                    ) : (
                        <HomeAppletWidget
                            applet={item.applet}
                            isEditing={isEditing}
                            isPending={isPending}
                            reloadToken={appletReloadToken}
                            menu={tileMenu}
                            onOpen={onOpen}
                        />
                    )
                ) : (
                    <>
                        {item.size === "mini" ? (
                            <DigestBlock
                                block={item.block}
                                menu={tileMenu}
                                isLayoutEditing={isEditing}
                                renderSummary={(reportMenu) => (
                                    <>
                                        {!isEditing && (
                                            <div className="absolute end-1.5 top-1.5 z-30">
                                                {reportMenu}
                                            </div>
                                        )}
                                        <DigestMiniCard
                                            block={item.block}
                                            isLayoutEditing={isEditing}
                                            onOpen={onOpen}
                                            t={t}
                                        />
                                    </>
                                )}
                            />
                        ) : (
                            <div className={cn("relative h-full")}>
                                <DigestBlock
                                    block={item.block}
                                    menu={tileMenu}
                                    onOpen={onOpen}
                                    isLayoutEditing={isEditing}
                                    className={cn(
                                        "h-full",
                                        !isEditing &&
                                            "transition-shadow hover:shadow-md",
                                    )}
                                    contentClassName={
                                        item.type === "automation"
                                            ? "h-full overflow-hidden"
                                            : "h-full overflow-auto px-3 py-2"
                                    }
                                />
                            </div>
                        )}
                    </>
                )}
            </div>
            {isEditing && item.type === "applet" ? (
                <button
                    type="button"
                    data-testid="home-modify-applet"
                    className="absolute end-1.5 bottom-1.5 z-20 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white/80 px-2.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur-sm ring-1 ring-black/[0.08] transition hover:bg-white hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900/80 dark:text-gray-200 dark:ring-white/15 dark:hover:bg-gray-800 dark:hover:text-white dark:focus:ring-sky-900/40"
                    onClick={() => onModifyApplet?.(item)}
                    disabled={isPending}
                    title={t("Edit")}
                    aria-label={t("Edit")}
                >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("Edit")}
                </button>
            ) : null}
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
                lockedMode={itemType === "automation" ? "automation" : "prompt"}
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
    return (
        <HomeWidgetDialogShell title={t("Edit report")} onClose={onClose}>
            <HomeDigestBlockEditor
                itemType={item.type}
                block={item.block}
                isPending={isPending}
                onSave={onSave}
                onCancel={onClose}
                t={t}
            />
        </HomeWidgetDialogShell>
    );
}

function EditActions({ item, isPending, onRemove, onResize, onEdit, t }) {
    if (item.type === "group") {
        return (
            <div
                className="absolute start-full top-1.5 z-30 ms-1 flex items-center"
                data-testid="home-group-remove-wrap"
            >
                <button
                    type="button"
                    className={cn(
                        homeEditIconButtonClass,
                        homeEditDangerIconButtonClass,
                    )}
                    onClick={() => onRemove(item)}
                    disabled={isPending}
                    title={t("Remove group")}
                    aria-label={t("Remove group")}
                    data-testid="home-group-remove"
                >
                    {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                    )}
                </button>
            </div>
        );
    }

    return (
        <div className="absolute end-1.5 top-1.5 z-20 flex max-w-[calc(100%-3rem)] items-center justify-end gap-0.5 overflow-x-auto">
            {item.type === "applet" ? (
                <AppletDisplayToggle
                    size={item.size}
                    disabled={isPending}
                    onToggle={() => onResize(item)}
                    t={t}
                />
            ) : (
                <button
                    type="button"
                    className={homeEditIconButtonClass}
                    onClick={() => onResize(item)}
                    disabled={isPending}
                    title={
                        item.size === "mini"
                            ? t("Show full card")
                            : t("Show summary")
                    }
                    aria-label={
                        item.size === "mini"
                            ? t("Show full card")
                            : t("Show summary")
                    }
                >
                    {item.size === "mini" ? (
                        <Maximize2 className="h-3.5 w-3.5" />
                    ) : (
                        <Minimize2 className="h-3.5 w-3.5" />
                    )}
                </button>
            )}
            {onEdit ? (
                <button
                    type="button"
                    className={homeEditIconButtonClass}
                    onClick={() => onEdit(item)}
                    disabled={isPending}
                    title={t("Edit")}
                    aria-label={t("Edit")}
                >
                    <Pencil className="h-3.5 w-3.5" />
                </button>
            ) : null}
            <button
                type="button"
                className={cn(
                    homeEditIconButtonClass,
                    homeEditDangerIconButtonClass,
                )}
                onClick={() => onRemove(item)}
                disabled={isPending}
                title={t("Remove from Home")}
                aria-label={t("Remove from Home")}
            >
                {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                )}
            </button>
        </div>
    );
}

function AppletDisplayToggle({ size, disabled, onToggle, t }) {
    const isLaunch = size === "mini";
    const segmentClass = (active) =>
        cn(
            "inline-flex min-h-10 items-center px-2 text-xs font-medium transition",
            active
                ? "bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-50"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100",
        );

    return (
        <div
            role="group"
            aria-label={t("How should this appear on Home?")}
            className="me-0.5 inline-flex overflow-hidden rounded-full bg-white/75 shadow-sm ring-1 ring-black/[0.06] backdrop-blur-sm dark:bg-gray-900/70 dark:ring-white/10"
        >
            <button
                type="button"
                data-testid="home-applet-display-launch"
                className={segmentClass(isLaunch)}
                aria-pressed={isLaunch}
                disabled={disabled || isLaunch}
                onClick={onToggle}
            >
                {t("Shortcut")}
            </button>
            <button
                type="button"
                data-testid="home-applet-display-interactive"
                className={segmentClass(!isLaunch)}
                aria-pressed={!isLaunch}
                disabled={disabled || !isLaunch}
                onClick={onToggle}
            >
                {t("Use on Home")}
            </button>
        </div>
    );
}

function DragHandle({ attributes, listeners, isPending, t }) {
    return (
        <button
            type="button"
            className={cn(
                "absolute start-1.5 top-1.5 z-20",
                homeEditIconButtonClass,
                "cursor-grab active:cursor-grabbing",
            )}
            disabled={isPending}
            title={t("Drag to reorder Home")}
            aria-label={t("Drag to reorder Home")}
            {...attributes}
            {...listeners}
        >
            <GripVertical className="h-3.5 w-3.5" />
        </button>
    );
}

function HomeGroupTitle({
    item,
    isEditing,
    isPending,
    onRename,
    hasContentBelow = false,
    hideTitle = false,
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

    // A sole group needs no title at all — hide it in both view and edit modes.
    if (hideTitle) return null;

    if (!isEditing) {
        return (
            <header
                className={cn("px-4 pe-14 py-3 text-start", headerClassName)}
            >
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
                    "flex min-h-12 items-center gap-2 px-4 py-2 ps-12 text-start",
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
                "flex min-h-12 items-center gap-2 px-4 py-2 ps-12 text-start",
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

function HomeAppletMiniCard({ applet, isEditing, isPending, onOpen }) {
    const { t } = useTranslation();
    const IconComponent = getAppIcon(applet);
    const updatedAt = applet.updatedAt ? new Date(applet.updatedAt) : null;

    return (
        <div
            className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            role={!isEditing ? "button" : undefined}
            tabIndex={!isEditing ? 0 : undefined}
            aria-label={t("Open app: {{name}}", { name: applet.name })}
            onClick={!isEditing && !isPending ? onOpen : undefined}
            onKeyDown={(event) => {
                if (
                    !isEditing &&
                    !isPending &&
                    (event.key === "Enter" || event.key === " ")
                ) {
                    event.preventDefault();
                    onOpen();
                }
            }}
        >
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
                isBusy={isPending && !isEditing}
                disableHover={isEditing}
                density="compact"
                imageOverlayVariant="home"
                contentStackClassName={isEditing ? "pt-14" : undefined}
                className="h-full !min-h-0"
            />
        </div>
    );
}

function DigestMiniCard({ block, isLayoutEditing = false, onOpen, t }) {
    const updatedAt = getBlockUpdatedAt(block);
    const preview = getDigestPreview(block, t);
    const isAutomation = isAutomationBlock(block);
    const canOpenFullscreen = !isLayoutEditing && canOpenBlockFullscreen(block);
    const openFullscreen = () => {
        if (canOpenFullscreen) onOpen?.();
    };

    return (
        <>
            <article
                className={cn(
                    "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-3 shadow-sm ring-1 ring-black/[0.04] transition dark:border-gray-700/90 dark:bg-gray-800 dark:ring-white/[0.06]",
                    isLayoutEditing && "pt-14",
                    !isLayoutEditing && "pe-12",
                    canOpenFullscreen &&
                        "cursor-pointer transition-colors hover:border-sky-300 hover:shadow-md dark:hover:border-sky-700",
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
                        ? `${t("Open report")}: ${t(block.title, {
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
                                {t("Task")}
                            </span>
                        )}
                        {isAutomation &&
                            !block.automationMissing &&
                            block.automation?.enabled === false && (
                                <span
                                    title={t(
                                        "This task is paused, so its report won't update automatically.",
                                    )}
                                    className="mt-1 ms-1 inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                >
                                    <AlertTriangle className="h-3 w-3" />
                                    {t("Disabled")}
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
        </>
    );
}
function HomeLoadingPlaceholder({ t }) {
    return (
        <div
            className="space-y-6"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <span className="sr-only">{t("Loading...")}</span>
            {[0, 1].map((section) => (
                <div
                    key={section}
                    className="rounded-2xl border border-gray-200/90 bg-white p-3 shadow-sm dark:border-gray-700/90 dark:bg-gray-800"
                >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {[0, 1, 2].map((card) => (
                            <div
                                key={card}
                                className="h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700/60"
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function HomePageEmptyState({ onOpenAdd, t }) {
    return (
        <EmptyState
            icon={
                <LayoutGrid className="h-12 w-12 text-gray-400 dark:text-gray-500" />
            }
            title={t("Your home page is empty.")}
            description={t("Add something to get started.")}
        >
            <HomeGroupAddMenu
                groupId={null}
                onOpenAdd={onOpenAdd}
                dataTour="home-empty-add"
                t={t}
            />
        </EmptyState>
    );
}

function EmptyAddState({ label }) {
    return (
        <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {label}
        </div>
    );
}
