import { useContext, useEffect, useState } from "react";
import { FaEdit } from "react-icons/fa";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import {
    useCreatePrompt,
    useDeletePrompt,
    usePromptsByIds,
    useUpdatePrompt,
} from "../../queries/prompts";
import { useUpdateWorkspace } from "../../queries/workspaces";
import PromptList from "./PromptList";
import { WorkspaceContext } from "./WorkspaceContent";

export default function WorkspaceInput({ onRun }) {
    const [text, setText] = useState("");
    const [selectedPrompt, setSelectedPrompt] = useState(null);
    const [editing, setEditing] = useState(false);
    const { workspace } = useContext(WorkspaceContext);
    const { data: prompts, isLoading: arePromptsLoading } = usePromptsByIds(
        workspace?.prompts || [],
    );

    if (arePromptsLoading) return null;

    const handleEdit = (prompt) => {
        setSelectedPrompt(prompt);
        setEditing(true);
    };

    return (
        <div className="h-full overflow-auto flex flex-col gap-2">
            <div className="basis-5/12 flex flex-col gap-3 p-1 overflow-auto">
                <textarea
                    placeholder="Enter some text here"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={10}
                    className="lb-input w-full h-full"
                ></textarea>
            </div>
            <div className="basis-2/12 overflow">
                <SystemPrompt />
            </div>
            <div className="basis-5/12 flex flex-col overflow-y-auto">
                {!editing && (
                    <PromptList
                        prompts={prompts}
                        onNew={() => {
                            setSelectedPrompt(null);
                            setEditing(true);
                        }}
                        onRunAll={async () => {
                            if (text) {
                                for (const prompt of prompts) {
                                    await onRun(
                                        prompt.title,
                                        text,
                                        prompt.text,
                                    );
                                }
                            }
                        }}
                        onSelect={async (prompt) => {
                            if (text) {
                                await onRun(prompt.title, text, prompt.text);
                            }
                        }}
                        onEdit={handleEdit}
                    />
                )}
                {editing && (
                    <PromptEditor
                        selectedPrompt={selectedPrompt}
                        onBack={() => setEditing(false)}
                    />
                )}
            </div>
        </div>
    );
}

function SystemPrompt() {
    const [editing, setEditing] = useState(false);
    const { workspace, isOwner } = useContext(WorkspaceContext);
    const value = workspace?.systemPrompt;

    if (editing) {
        return (
            <SystemPromptEditor
                value={value}
                onCancel={() => setEditing(false)}
                onSave={(p) => {
                    setEditing(false);
                }}
            />
        );
    }

    return (
        <div className="p-1">
            <div className="w-full text-left bg-gray-50 p-2 rounded border">
                <div className="flex gap-2 items-center justify-between">
                    <div className="text-gray-500 text-xs">{value}</div>
                    {isOwner && (
                        <div
                            className="text-gray-500 hover:text-gray-700 active:text-gray-900 cursor-pointer"
                            onClick={(e) => {
                                setEditing(true);
                            }}
                            title="Edit prompt"
                        >
                            <FaEdit />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function SystemPromptEditor({ value, onCancel, onSave }) {
    const [prompt, setPrompt] = useState(value);
    const updateWorkspace = useUpdateWorkspace();
    const { workspace } = useContext(WorkspaceContext);

    return (
        <div className="p-1">
            <h4 className="text-lg font-medium mb-4">System Prompt</h4>
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="lb-input mb-2"
                rows={5}
                type="text"
                placeholder="Enter a prompt here to run against the input"
            />
            <div className="flex justify-between gap-2">
                <div className="flex gap-2">
                    <button
                        className="lb-outline-secondary flex gap-2 px-4"
                        onClick={() => onCancel()}
                    >
                        Cancel
                    </button>
                    <LoadingButton
                        loading={updateWorkspace.isLoading}
                        text="Saving..."
                        className="lb-primary flex justify-center gap-2 px-4"
                        disabled={!prompt}
                        onClick={async () => {
                            await updateWorkspace.mutateAsync({
                                id: workspace?._id,
                                data: { systemPrompt: prompt },
                            });
                            onSave(prompt);
                        }}
                    >
                        Save
                    </LoadingButton>
                </div>
            </div>
        </div>
    );
}

function PromptEditor({ selectedPrompt, onBack }) {
    const [title, setTitle] = useState("");
    const [prompt, setPrompt] = useState("");
    const updatePrompt = useUpdatePrompt();
    const createPrompt = useCreatePrompt();
    const deletePrompt = useDeletePrompt();
    const { user, workspace } = useContext(WorkspaceContext);

    useEffect(() => {
        if (selectedPrompt) {
            setTitle(selectedPrompt.title);
            setPrompt(selectedPrompt.text);
        } else {
            setTitle("");
            setPrompt("");
        }
    }, [selectedPrompt]);
    const isOwner = selectedPrompt?.owner?.toString() === user._id?.toString();

    return (
        <div className="p-1">
            <h4 className="text-lg font-medium mb-4">Prompt</h4>
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="lb-input mb-2"
                placeholder="Enter a title for the prompt"
            />
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="lb-input mb-2"
                rows={5}
                type="text"
                placeholder="Enter a prompt here to run against the input"
            />
            <div className="flex justify-between gap-2">
                {isOwner ? (
                    <LoadingButton
                        text="delete"
                        className="lb-outline-danger"
                        onClick={async () => {
                            if (
                                window.confirm(
                                    "Are you sure you want to delete this prompt?",
                                )
                            ) {
                                await deletePrompt.mutateAsync({
                                    id: selectedPrompt._id,
                                    workspace,
                                });
                                onBack();
                            }
                        }}
                    >
                        Delete
                    </LoadingButton>
                ) : (
                    <div></div>
                )}
                <div className="flex gap-2">
                    <button
                        className="lb-outline-secondary flex gap-2 px-4"
                        onClick={onBack}
                    >
                        Cancel
                    </button>
                    <LoadingButton
                        loading={updatePrompt.isLoading}
                        text="Saving..."
                        className="lb-primary flex justify-center gap-2 px-4"
                        disabled={!prompt || !title}
                        onClick={async () => {
                            if (selectedPrompt && isOwner) {
                                await updatePrompt.mutateAsync({
                                    id: selectedPrompt._id,
                                    data: { title, text: prompt },
                                });
                                onBack();
                            } else {
                                await createPrompt.mutateAsync({
                                    workspace,
                                    prompt: { title, text: prompt },
                                });
                                onBack();
                            }
                        }}
                    >
                        {isOwner ? "Save" : "Save as new prompt"}
                    </LoadingButton>
                </div>
                {deletePrompt.isError ||
                    (updatePrompt.isError && (
                        <div className="text-red-500">
                            Error saving prompt:
                            {deletePrompt.error?.response?.data?.message ||
                                updatePrompt.error?.response?.data?.message}
                        </div>
                    ))}
            </div>
        </div>
    );
}
