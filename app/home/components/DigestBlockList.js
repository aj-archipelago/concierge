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
import { GripVertical, PlusIcon, SettingsIcon, X } from "lucide-react";
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
import EditDigestBlock from "./EditDigestBlock";

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
