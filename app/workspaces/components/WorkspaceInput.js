import { useEffect, useState } from "react";
import { FaPlay } from "react-icons/fa";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import PromptList from "./PromptList";
import { useWorkspace } from "../../queries/workspaces";
import {
    useCreatePrompt,
    useDeletePrompt,
    usePromptsByIds,
    useUpdatePrompt,
} from "../../queries/prompts";

export default function WorkspaceInput({ onRun, user, id }) {
    const [text, setText] = useState("");
    const [selectedPrompt, setSelectedPrompt] = useState(null);
    const [editing, setEditing] = useState(false);
    const { data: workspace } = useWorkspace(id);
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
            <div className="basis-5/12 flex flex-col gap-3 p-1">
                <textarea
                    placeholder="Enter some text here"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={10}
                    className="lb-input w-full h-full"
                ></textarea>
            </div>
            <div className="basis-7/12 flex flex-col overflow-y-auto">
                {!editing && (
                    <PromptList
                        prompts={prompts}
                        onNew={() => {
                            setSelectedPrompt(null);
                            setEditing(true);
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
                        workspaceId={id}
                        userId={user?._id}
                        selectedPrompt={selectedPrompt}
                        onBack={() => setEditing(false)}
                    />
                )}
            </div>
        </div>
    );
}

function PromptEditor({ workspaceId, userId, selectedPrompt, onBack }) {
    const [title, setTitle] = useState("");
    const [prompt, setPrompt] = useState("");
    const updatePrompt = useUpdatePrompt();
    const createPrompt = useCreatePrompt();
    const deletePrompt = useDeletePrompt();

    useEffect(() => {
        if (selectedPrompt) {
            setTitle(selectedPrompt.title);
            setPrompt(selectedPrompt.text);
        } else {
            setTitle("");
            setPrompt("");
        }
    }, [selectedPrompt]);
    const isOwner = selectedPrompt?.owner?.toString() === userId?.toString();

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
                                    workspaceId,
                                });
                                console.log("deleted");
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
                                    workspaceId,
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
