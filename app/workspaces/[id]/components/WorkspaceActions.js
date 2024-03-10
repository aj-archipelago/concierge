"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaEdit, FaEllipsisH, FaLink } from "react-icons/fa";
import LoadingButton from "../../../../src/components/editor/LoadingButton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import stringcase from "stringcase";
import { useDeleteWorkspace, useWorkspace } from "../../../queries/workspaces";

export default function WorkspaceActions({ id, user }) {
    const router = useRouter();
    const { data: workspace, isLoading } = useQuery({
        queryKey: ["workspaces", id],
        queryFn: async ({}) => {
            const { data } = await axios.get(`/api/workspaces/${id}`);
            return data;
        },
    });

    if (isLoading) return null;

    return (
        <div>
            <div className="flex gap-4 justify-between mb-4">
                <div className="flex gap-3">
                    <div>
                        <button
                            className="lb-outline-secondary"
                            onClick={() => router.push("/workspaces")}
                        >
                            <FaArrowLeft />
                        </button>
                    </div>
                    <Name workspace={workspace} user={user} />
                </div>

                <Actions workspace={workspace} user={user} />
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

    useEffect(() => {
        setName(workspace?.name);
        setSlug(workspace?.slug);
    }, [workspace]);

    const updateWorkspace = useMutation({
        queryKey: ["workspace", workspace?._id],
        mutationFn: async (attrs) => {
            setEditing(false);
            await axios.put(`/api/workspaces/${workspace._id}`, attrs);
        },
        onMutate: async (attrs) => {
            await queryClient.cancelQueries(["workspaces", workspace?._id]);
            const previousWorkspace = queryClient.getQueryData([
                "workspaces",
                workspace?._id,
            ]);
            queryClient.setQueryData(["workspaces", workspace?._id], (old) => {
                return { ...old, name };
            });
            return { previousWorkspace };
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["workspaces", workspace?._id]);
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
                            className="border-0 ring-1 rounded w-full bg-gray-50 p-0 font-medium text-xl "
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
                    <div className="text-sm flex items-center">
                        <div className=" flex gap-2 items-center text-gray-500">
                            <FaLink />
                            https://labeeb.aljazeera.com/
                        </div>
                        <input
                            type="text"
                            className="border-0 ring-1 rounded bg-gray-50 p-0 text-sm "
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
                                    Error saving:{" "}
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
                        Save
                    </LoadingButton>
                </div>
                <div>
                    <button
                        className="lb-sm lb-outline-secondary"
                        onClick={handleCancel}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    } else {
        return (
            <div className="flex gap-4 [&>button]:hidden [&:hover>button]:block">
                <div>
                    <h1 className="text-xl font-medium">{name}</h1>
                    <div className="text-sm flex gap-2 items-center text-gray-400">
                        <FaLink />
                        <span>
                            https://labeeb.aljazeera.com/
                            <span className="text-gray-900">{slug}</span>
                        </span>
                    </div>
                    <div className="text-sm">
                        {updateWorkspace.isError && (
                            <div>
                                <div className="text-red-500">
                                    Error saving:{" "}
                                    {updateWorkspace.error.message}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {user?._id?.toString() === workspace?._id?.toString() && (
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

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this workspace?")) return;
        await deleteWorkspace.mutateAsync({ id: workspace._id });
        router.push("/workspaces");
    };

    if (isUserOwner) {
        return (
            <div>
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <div className="lb-outline-secondary">
                            <FaEllipsisH />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem>
                            <button className="p-1" onClick={handleDelete}>
                                Delete this workspace
                            </button>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        );
    } else {
        return <MembershipActions user={user} id={workspace._id} />;
    }
}

function MembershipActions({ id }) {
    const queryClient = useQueryClient();
    const { data: workspace } = useWorkspace(id);
    const hasBeenAddedByUser = workspace?.joined;

    const handleAddToWorkspaces = async () => {
        await axios.post(`/api/workspaces/${workspace._id}/join`);
        queryClient.invalidateQueries(["workspaces"]);
    };

    const handleRemoveFromWorkspaces = async () => {
        await axios.post(`/api/workspaces/${workspace._id}/leave`);
        queryClient.invalidateQueries(["workspaces"]);
    };

    if (hasBeenAddedByUser) {
        return (
            <div>
                <button
                    className="lb-outline-secondary"
                    onClick={handleRemoveFromWorkspaces}
                >
                    Remove from my workspaces
                </button>
            </div>
        );
    } else {
        return (
            <div>
                <button className="lb-primary" onClick={handleAddToWorkspaces}>
                    + Add to my workspaces
                </button>
            </div>
        );
    }
}
