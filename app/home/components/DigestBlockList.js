"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlusIcon, SettingsIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import Loader from "../../components/loader";
import {
    useCurrentUserDigest,
    useUpdateCurrentUserDigest,
} from "../../queries/digest";
import { useCurrentUser } from "../../queries/users";
import classNames from "../../utils/class-names";
import DigestBlock from "./DigestBlock";

export default function DigestBlockList() {
    const { data: digest } = useCurrentUserDigest();
    const updateCurrentUserDigest = useUpdateCurrentUserDigest();
    const [editing, setEditing] = useState(false);
    const { t } = useTranslation();
    const { data: user } = useCurrentUser();

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
            <div className="flex justify-between mb-2 gap-8">
                {digest?.greeting && (
                    <div className="[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:ps-6">
                        <ReactMarkdown>{digest?.greeting}</ReactMarkdown>
                    </div>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <SettingsIcon className="h-4 w-4 text-gray-500" />
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
                {digest.blocks.map((block) => (
                    <DigestBlock
                        key={block._id}
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

function DigestEditor({ value, onChange, onCancel }) {
    const [digestBlocks, setDigestBlocks] = useState(value || []);
    const { t } = useTranslation();

    useEffect(() => {
        setDigestBlocks(value);
    }, [value]);

    const handleSave = async () => {
        onChange(digestBlocks);
    };

    // assign ids based on index
    const blocks = digestBlocks.map((b, i) => {
        return {
            ...b,
            id: i,
        };
    });

    return (
        <div>
            <h2 className="text-lg font-semibold mb-4">{t("Edit Digest")}</h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-2">
                {blocks?.map((p) => {
                    return (
                        <div
                            key={p.id}
                            className=" bg-gray-50 p-4 rounded-md border"
                        >
                            <div className="justify-end flex mb-2 text-gray-400">
                                <button
                                    onClick={() => {
                                        setDigestBlocks(
                                            blocks.filter((d) => d.id !== p.id),
                                        );
                                    }}
                                >
                                    <X />
                                </button>
                            </div>

                            <EditDigestBlock
                                value={p}
                                onChange={(v) => {
                                    setDigestBlocks(
                                        blocks.map((d) => {
                                            if (d.id === p.id) {
                                                return v;
                                            }

                                            return d;
                                        }),
                                    );
                                }}
                            />
                        </div>
                    );
                })}
                <button
                    className=" flex justify-center items-center h-24 border default white-button rounded-md"
                    onClick={() => {
                        setDigestBlocks([
                            ...blocks,
                            {
                                title: "",
                                prompt: "",
                                id: blocks.length,
                            },
                        ]);
                    }}
                >
                    <PlusIcon className="h-6 w-6 text-gray-400" />
                </button>
            </div>
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

    return (
        <div>
            <input
                placeholder={t("Title")}
                className="lb-input font-semibold mb-4"
                value={value.title}
                onChange={(e) => {
                    onChange({
                        ...value,
                        title: e.target.value,
                    });
                }}
            />
            <textarea
                placeholder={t("Prompt")}
                className="lb-input"
                rows={6}
                value={value.prompt}
                onChange={(e) => {
                    onChange({
                        ...value,
                        prompt: e.target.value,
                    });
                }}
            />
        </div>
    );
}
