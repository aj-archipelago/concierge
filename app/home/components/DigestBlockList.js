"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    rectIntersection,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    GripVertical,
    PlusIcon,
    SettingsIcon,
    Sparkles,
    X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Loader from "../../components/loader";
import {
    useCurrentUserDigest,
    useUpdateCurrentUserDigest,
} from "../../queries/digest";
import classNames from "../../utils/class-names";
import DigestBlock from "./DigestBlock";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";
import { useAutomations } from "../../../src/hooks/useAutomations";

export default function DigestBlockList() {
    const { data: digest } = useCurrentUserDigest();
    const updateCurrentUserDigest = useUpdateCurrentUserDigest();
    const [editing, setEditing] = useState(false);
    const { t } = useTranslation();

    if (!digest) {
        return <Loader />;
    }

    if (editing) {
        return (
            <DigestEditor
                value={digest.blocks}
                onCancel={() => setEditing(false)}
                onChange={(v) => {
                    updateCurrentUserDigest.mutateAsync({
                        blocks: v,
                    });

                    setEditing(false);
                }}
            />
        );
    }

    return (
        <>
            <div className="flex justify-between items-start mb-2 gap-8">
                {digest?.greeting && (
                    <div>
                        {convertMessageToMarkdown({ payload: digest.greeting })}
                    </div>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <SettingsIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent sideOffset={8}>
                        <DropdownMenuItem onClick={() => setEditing(true)}>
                            {t("Edit dashboard")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div
                className={classNames(
                    "grid gap-4",
                    digest.blocks.length > 1
                        ? "sm:grid-cols-2"
                        : "sm:grid-cols-1",
                )}
            >
                {digest.blocks.map((block, index) => (
                    <DigestBlock
                        key={block._id || block.id || `block-${index}`}
                        block={block}
                        contentClassName={
                            digest.blocks.length > 2
                                ? "max-h-64 overflow-auto"
                                : "max-h-[calc(100vh-350px)] overflow-auto"
                        }
                    />
                ))}
            </div>
        </>
    );
}

function SortableDigestBlock({ id, block, onDelete, onBlockChange }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition: transition || "transform 100ms ease",
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={classNames(
                "bg-gray-50 dark:bg-gray-700 p-4 rounded-md border",
                isDragging && "opacity-50 shadow-lg",
            )}
        >
            <div className="justify-between flex mb-2 text-gray-400 dark:text-gray-500">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing"
                >
                    <GripVertical className="h-5 w-5" />
                </button>
                <button onClick={onDelete}>
                    <X />
                </button>
            </div>
            <EditDigestBlock value={block} onChange={onBlockChange} />
        </div>
    );
}

function DigestEditor({ value, onChange, onCancel }) {
    const [digestBlocks, setDigestBlocks] = useState(value || []);
    const { t } = useTranslation();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    useEffect(() => {
        setDigestBlocks(value);
    }, [value]);

    const handleSave = async () => {
        onChange(digestBlocks);
    };

    // assign string ids based on index
    const blocks = digestBlocks.map((b, i) => ({
        ...b,
        id: String(i),
    }));

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = blocks.findIndex((b) => b.id === active.id);
        const newIndex = blocks.findIndex((b) => b.id === over.id);
        setDigestBlocks(arrayMove(blocks, oldIndex, newIndex));
    };

    return (
        <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
                {t("Edit dashboard")}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Configure the blocks that appear in your dashboard here. You can
                add or delete blocks and edit the prompts for each block.
            </p>
            <DndContext
                sensors={sensors}
                collisionDetection={rectIntersection}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={blocks.map((b) => b.id)}
                    strategy={rectSortingStrategy}
                >
                    <div className="grid sm:grid-cols-2 gap-4 mb-2">
                        {blocks.map((p) => (
                            <SortableDigestBlock
                                key={p.id}
                                id={p.id}
                                block={p}
                                onDelete={() =>
                                    setDigestBlocks(
                                        blocks.filter((d) => d.id !== p.id),
                                    )
                                }
                                onBlockChange={(v) =>
                                    setDigestBlocks(
                                        blocks.map((d) =>
                                            d.id === p.id ? v : d,
                                        ),
                                    )
                                }
                            />
                        ))}
                        <button
                            className=" flex justify-center items-center h-24 border default white-button rounded-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                            onClick={() => {
                                setDigestBlocks([
                                    ...blocks,
                                    {
                                        title: "",
                                        prompt: "",
                                        id: String(blocks.length),
                                    },
                                ]);
                            }}
                        >
                            <PlusIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                        </button>
                    </div>
                </SortableContext>
            </DndContext>
            <div className="flex gap-2 ">
                <button onClick={handleSave} className="lb-primary">
                    {t("Save")}
                </button>
                <button
                    onClick={() => {
                        setDigestBlocks(value);
                        onCancel();
                    }}
                    className="lb-outline-secondary"
                >
                    {t("Cancel")}
                </button>
            </div>
        </div>
    );
}

function EditDigestBlock({ value, onChange }) {
    const { t } = useTranslation();
    const { data: automations = [] } = useAutomations();

    const initialMode = value.automationId ? "automation" : "prompt";
    const [mode, setMode] = useState(initialMode);

    useEffect(() => {
        setMode(value.automationId ? "automation" : "prompt");
    }, [value.automationId]);

    const setSourceMode = (nextMode) => {
        setMode(nextMode);
        if (nextMode === "prompt") {
            onChange({ ...value, automationId: null });
        } else {
            onChange({ ...value, prompt: "" });
        }
    };

    return (
        <div>
            <input
                placeholder={t("Title")}
                className="lb-input font-semibold mb-3"
                value={value.title}
                onChange={(e) => {
                    onChange({
                        ...value,
                        title: e.target.value,
                    });
                }}
            />
            <div className="mb-3 inline-flex rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5 text-xs">
                <button
                    type="button"
                    onClick={() => setSourceMode("prompt")}
                    className={classNames(
                        "px-3 py-1 rounded-sm",
                        mode === "prompt"
                            ? "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                            : "text-gray-600 dark:text-gray-300",
                    )}
                >
                    {t("Prompt")}
                </button>
                <button
                    type="button"
                    onClick={() => setSourceMode("automation")}
                    className={classNames(
                        "px-3 py-1 rounded-sm inline-flex items-center gap-1",
                        mode === "automation"
                            ? "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                            : "text-gray-600 dark:text-gray-300",
                    )}
                >
                    <Sparkles className="h-3 w-3" />
                    {t("Automation")}
                </button>
            </div>
            {mode === "prompt" ? (
                <textarea
                    placeholder={t("Prompt")}
                    className="lb-input"
                    rows={6}
                    value={value.prompt || ""}
                    onChange={(e) => {
                        onChange({
                            ...value,
                            prompt: e.target.value,
                        });
                    }}
                />
            ) : automations.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-600 px-3 py-4 text-xs text-gray-500 dark:text-gray-400">
                    {t("No automations yet.")}{" "}
                    <a
                        href="/automations"
                        className="text-sky-600 dark:text-sky-400 hover:underline"
                    >
                        {t("Create one")}
                    </a>
                </div>
            ) : (
                <>
                    <select
                        className="lb-input"
                        value={value.automationId || ""}
                        onChange={(e) => {
                            onChange({
                                ...value,
                                automationId: e.target.value || null,
                            });
                        }}
                    >
                        <option value="">{t("Select an automation...")}</option>
                        {automations.map((automation) => (
                            <option key={automation._id} value={automation._id}>
                                {automation.name}
                                {automation.producesHtml ? " · HTML" : ""}
                            </option>
                        ))}
                    </select>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {t(
                            "This widget will display the automation's most recent run.",
                        )}
                    </p>
                </>
            )}
        </div>
    );
}
