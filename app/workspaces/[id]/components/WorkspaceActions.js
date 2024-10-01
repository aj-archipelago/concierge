"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FaArrowLeft,
    FaArrowRight,
    FaEdit,
    FaEllipsisH,
    FaLink,
} from "react-icons/fa";
import stringcase from "stringcase";
import { ServerContext } from "../../../../src/App";
import LoadingButton from "../../../../src/components/editor/LoadingButton";
import { LanguageContext } from "../../../../src/contexts/LanguageProvider";
import {
    useCopyWorkspace,
    useDeleteWorkspace,
    usePublishWorkspace,
    useWorkspace,
} from "../../../queries/workspaces";

export default function WorkspaceActions({ idOrSlug, user }) {
    const router = useRouter();
    const { data: workspace, isLoading } = useWorkspace(idOrSlug);
    const { direction } = useContext(LanguageContext);

    if (isLoading) return null;

    return (
        <div>
            <div className="flex gap-4 justify-between mb-4">
                <div className="flex gap-4 grow overflow-auto">
                    <div className="hidden sm:block">
                        <button
                            className="lb-outline-secondary"
                            onClick={() => router.push("/workspaces")}
                        >
                            {direction === "rtl" ? (
                                <FaArrowRight />
                            ) : (
                                <FaArrowLeft />
                            )}
                        </button>
                    </div>
                    <div className="overflow-hidden hidden sm:block">
                        <Name workspace={workspace} user={user} />
                    </div>
                    <div className="block sm:hidden">
                        <h4 className="font-medium">{workspace?.name}</h4>
                    </div>
                </div>

                <div className="hidden sm:block">
                    <Actions workspace={workspace} user={user} />
                </div>
            </div>
        </div>
    );
}

function Name({ workspace, user }) {
    const [name, setName] = useState(workspace?.name);
    const [slug, setSlug] = useState(
        workspace?.slug || stringcase.spinalcase(workspace?.name),
    );
    const [editing, setEditing] = useState(false);
    const queryClient = useQueryClient();
    const serverContext = useContext(ServerContext);
    const [showCopiedMessage, setShowCopiedMessage] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        if (!workspace) return;

        setName(workspace?.name);
        setSlug(workspace?.slug);
    }, [workspace]);

    useEffect(() => {
        if (showCopiedMessage) {
            setTimeout(() => {
                setShowCopiedMessage(false);
            }, 3000);
        }
    }, [showCopiedMessage]);

    useEffect(() => {
        setSlug(stringcase.spinalcase(name));
    }, [name]);

    const updateWorkspace = useMutation({
        queryKey: ["workspace", workspace?._id],
        mutationFn: async (attrs) => {
            setEditing(false);
            const response = await axios.put(
                `/api/workspaces/${workspace._id}`,
                attrs,
            );
            return response.data;
        },
        onMutate: async (attrs) => {
            await queryClient.cancelQueries({
                queryKey: ["workspace", workspace?._id],
            });
            const previousWorkspace = queryClient.getQueryData([
                "workspace",
                workspace?._id,
            ]);
            queryClient.setQueryData(["workspace", workspace?._id], (old) => {
                return { ...old, name };
            });
            return { previousWorkspace };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["workspace", workspace?._id],
            });
        },
    });

    const handleSave = async () => {
        if (!name || !slug) return;

        try {
            await updateWorkspace.mutateAsync({ name, slug });
        } catch (e) {
            console.error(e);
        }
        setEditing(false);
    };

    const handleCancel = () => {
        setEditing(false);
        setName(workspace?.name);
    };

    if (editing) {
        return (
            <div className="flex gap-2">
                <div>
                    <div>
                        <input
                            autoFocus
                            type="text"
                            className="border-0 ring-1 w-full bg-gray-50 p-0 font-medium text-xl "
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSave();
                                }
                                if (e.key === "Escape") {
                                    handleCancel();
                                }
                            }}
                        />
                    </div>
                    <div className=" flex items-center" dir="ltr">
                        <div className=" flex gap-2 text-xs sm:text-sm items-center text-gray-500">
                            <FaLink />
                            {serverContext?.serverUrl}/workspaces/
                        </div>
                        <input
                            type="text"
                            className="border-0 ring-1 text-xs sm:text-sm bg-gray-50 p-0 text-sm "
                            value={slug}
                            onChange={(e) => {
                                setSlug(e.target.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSave();
                                }
                                if (e.key === "Escape") {
                                    handleCancel();
                                }
                            }}
                        />
                    </div>
                    <div className="text-sm">
                        {updateWorkspace.isError && (
                            <div>
                                <div className="text-red-500">
                                    {t("Error saving")}:{" "}
                                    {updateWorkspace.error.message}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <LoadingButton
                        text="Saving..."
                        loading={updateWorkspace.isLoading}
                        className="lb-sm lb-primary"
                        onClick={handleSave}
                    >
                        {t("Save")}
                    </LoadingButton>
                </div>
                <div>
                    <button
                        className="lb-sm lb-outline-secondary"
                        onClick={handleCancel}
                    >
                        {t("Cancel")}
                    </button>
                </div>
            </div>
        );
    } else {
        return (
            <div className="flex gap-4 [&>button]:hidden ">
                <div>
                    <h1
                        className="text-xl font-medium hover:underline"
                        onClick={() => setEditing(true)}
                    >
                        {name}
                    </h1>
                    <div className="text-xs sm:text-sm flex gap-2 items-center text-gray-400 relative">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(
                                    `${serverContext?.serverUrl}/workspaces/${slug}`,
                                );
                                setShowCopiedMessage(true);
                            }}
                        >
                            <FaLink />
                        </button>
                        {showCopiedMessage && (
                            <div className="bg-white text-gray-400">
                                {t("Copied to clipboard")}
                            </div>
                        )}
                        {!showCopiedMessage && (
                            <span dir="ltr">
                                {serverContext?.serverUrl}/workspaces/
                                <span className="text-gray-900">{slug}</span>
                            </span>
                        )}
                    </div>
                    <div className="text-sm">
                        {updateWorkspace.isError && (
                            <div>
                                <div className="text-red-500">
                                    {t("Error saving")}:{" "}
                                    {updateWorkspace.error.message}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {user?._id?.toString() === workspace?.owner?.toString() && (
                    <button
                        className="lb-outline-secondary self-start"
                        onClick={() => setEditing(true)}
                    >
                        <FaEdit />
                    </button>
                )}
            </div>
        );
    }
}

function Actions({ user, workspace }) {
    const router = useRouter();
    const isUserOwner = workspace?.owner === user._id;
    const deleteWorkspace = useDeleteWorkspace();
    const publishWorkspace = usePublishWorkspace();
    const { t } = useTranslation();
    console.log("workspace", workspace);
    const serverContext = useContext(ServerContext);

    const handleDelete = async () => {
        if (
            !window.confirm(
                t("Are you sure you want to delete this workspace?"),
            )
        )
            return;
        await deleteWorkspace.mutateAsync({ id: workspace._id });
        router.push("/workspaces");
    };

    const handlePublish = async () => {
        await publishWorkspace.mutateAsync({ id: workspace._id, publish: !workspace.published });
    };

    if (isUserOwner) {
        return (
            <div className="flex gap-4 items-center">
                <div className="text-sm">
                    {publishWorkspace.isLoading && (
                        <div>Publishing...</div>
                    )}
                    {publishWorkspace.error && (
                        <div>Error publishing: {publishWorkspace.error.message}</div>
                    )}
                    {workspace.published && (
                        <div className="text-sm text-gray-600 font-mono bg-gray-100 p-2 rounded-md overflow-x-auto">
                            <span className="font-semibold">API:</span> <span className="break-all">{serverContext.graphQLUrl + "-user"}</span>
                        </div>
                    )}
                </div>
                <div>
                    <DropdownMenu>
                        <DropdownMenuTrigger>
                            <div className="lb-outline-secondary">
                                <FaEllipsisH />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem>
                                <button className="p-1" onClick={handlePublish}>
                                    {workspace.published ? t("Unpublish from cortex") : t("Publish to cortex")}
                                </button>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <button className="p-1" onClick={handleDelete}>
                                    {t("Delete this workspace")}
                                </button>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        );
    } else {
        return <MembershipActions user={user} id={workspace?._id} />;
    }
}

function MembershipActions({ id }) {
    const router = useRouter();
    const copyWorkspace = useCopyWorkspace();
    const { t } = useTranslation();

    const handleCopyWorkspace = async () => {
        const workspace = await copyWorkspace.mutateAsync({ id });
        router.push(`/workspaces/${workspace._id}`);
    };

    return (
        <div>
            <LoadingButton
                loading={copyWorkspace.isLoading}
                text="Copying..."
                className="lb-primary"
                onClick={handleCopyWorkspace}
            >
                {t("Make a copy of this workspace")}
            </LoadingButton>
        </div>
    );
}
