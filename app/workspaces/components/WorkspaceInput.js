import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaEdit } from "react-icons/fa";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import { useLLMs } from "../../queries/llms";
import {
    useCreatePrompt,
    useDeletePrompt,
    useUpdatePrompt,
} from "../../queries/prompts";
import {
    useUpdateWorkspace,
    useUpdateWorkspaceState,
    useWorkspaceState,
} from "../../queries/workspaces";
import PromptList from "./PromptList";
import PromptSelectorModal from "./PromptSelectorModal";
import { WorkspaceContext } from "./WorkspaceContent";
import { Modal } from "../../../@/components/ui/modal";

export default function WorkspaceInput({ onRun, onRunMany }) {
    const [text, setText] = useState("");
    const [selectedPrompt, setSelectedPrompt] = useState(null);
    const [editing, setEditing] = useState(false);
    const { workspace } = useContext(WorkspaceContext);
    const [isOpen, setIsOpen] = useState(false);
    const [systemPromptEditing, setSystemPromptEditing] = useState(false);
    const { t } = useTranslation();
    const { data: workspaceState, isStateLoading } = useWorkspaceState(
        workspace?._id,
    );
    const updateWorkspaceState = useUpdateWorkspaceState();
    const updateWorkspace = useUpdateWorkspace();
    const promptIds = workspace?.prompts || [];
    const textRef = useRef(text);

    useEffect(() => {
        textRef.current = text;
    }, [text]);

    const handleEdit = (prompt) => {
        setSelectedPrompt(prompt);
        setEditing(true);
    };

    const timeoutRef = useRef(null);

    useEffect(() => {
        if (workspaceState?.inputText && !textRef.current) {
            setText(workspaceState.inputText);
        }
    }, [workspaceState]);

    useEffect(() => {
        // debounced updated to user state based on text
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            updateWorkspaceState.mutateAsync({
                id: workspace?._id,
                attrs: { inputText: text },
            });
        }, 1000);
        // eslint-disable-next-line
    }, [text, workspace?._id]);

    if (isStateLoading || !workspace) {
        return null;
    }

    return (
        <div className="h-full overflow-auto flex flex-col gap-2">
            <>
                <div className="basis-4/12 min-h-[150px] max-h-[200px] flex flex-col gap-3 p-1 overflow-auto">
                    <textarea
                        placeholder={t("Enter some text here")}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={8}
                        className="lb-input w-full h-full"
                    ></textarea>
                </div>
                <div className="basis-8/12 min-h-[250px] flex flex-col overflow-y-auto">
                    <SystemPrompt
                        editing={systemPromptEditing}
                        setEditing={setSystemPromptEditing}
                    />

                    <>
                        <Modal
                            show={editing}
                            onHide={() => setEditing(false)}
                            title={t("Edit prompt")}
                        >
                            <PromptEditor
                                selectedPrompt={selectedPrompt}
                                onBack={() => setEditing(false)}
                            />
                        </Modal>
                        <PromptList
                            inputValid={!!text}
                            promptIds={promptIds}
                            onNew={() => {
                                setIsOpen(true);
                            }}
                            onRunAll={onRunMany(text, promptIds)}
                            onRun={async (prompt) => {
                                if (text) {
                                    await onRun(text, prompt);
                                }
                            }}
                            onReorder={async (promptIds) => {
                                updateWorkspace.mutate({
                                    id: workspace?._id,
                                    data: {
                                        prompts: promptIds,
                                    },
                                });
                            }}
                            onEdit={handleEdit}
                        />
                    </>
                </div>
            </>
            <PromptSelectorModal isOpen={isOpen} setIsOpen={setIsOpen} />
        </div>
    );
}

function SystemPrompt({ editing, setEditing }) {
    const { t } = useTranslation();
    const { workspace, isOwner } = useContext(WorkspaceContext);
    const value = workspace?.systemPrompt;

    if (!value && !editing) {
        return (
            <div className="p-1 flex gap-2">
                <h4 className="font-medium mt-1 mb-1">{t("Context")}</h4>
                <div className="flex gap-2 items-center text-sm">
                    <div className="text-gray-500">{t("(None)")}</div>
                    <div
                        className="text-sky-500 hover:text-gray-700 active:text-gray-900 cursor-pointer"
                        onClick={(e) => {
                            setEditing(true);
                        }}
                        title={t("Add a prompt")}
                    >
                        + {t("Add context")}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-1 flex gap-2 items-center">
            <Modal
                show={editing}
                onHide={() => setEditing(false)}
                title={t("Context")}
            >
                <SystemPromptEditor
                    value={value}
                    onCancel={() => setEditing(false)}
                    onSave={(p) => {
                        setEditing(false);
                    }}
                />
            </Modal>
            <h4 className="font-medium mb-1">{t("Context")}</h4>

            <div className="overflow-auto text-start bg-gray-50 p-2 rounded-md border w-full">
                <div className="flex gap-2 items-center justify-between w-full">
                    <div className="min-w-0 flex-1">
                        <div
                            className="truncate min-w-0 text-gray-500 text-xs"
                            title={value}
                        >
                            {value}
                        </div>
                    </div>
                    {isOwner && (
                        <div
                            className="text-gray-500 hover:text-gray-700 active:text-gray-900 cursor-pointer"
                            onClick={(e) => {
                                setEditing(true);
                            }}
                            title={t("Edit prompt")}
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
    const { t } = useTranslation();

    return (
        <div className="p-1">
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="lb-input mb-2"
                rows={5}
                type="text"
                placeholder={t(
                    "e.g. You are an expert journalist working at Al Jazeera Media Network.",
                )}
            />
            <div className="flex justify-between gap-2">
                <LoadingButton
                    text={t("Deleting") + "..."}
                    className="lb-outline-danger"
                    onClick={async () => {
                        if (
                            window.confirm(
                                t(
                                    "Are you sure you want to delete this prompt?",
                                ),
                            )
                        ) {
                            await updateWorkspace.mutateAsync({
                                id: workspace?._id,
                                data: { systemPrompt: "" },
                            });
                            onCancel();
                        }
                    }}
                >
                    {t("Delete")}
                </LoadingButton>
                <div className="flex gap-2">
                    <LoadingButton
                        loading={updateWorkspace.isLoading}
                        text={t("Saving") + "..."}
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
                        {t("Save")}
                    </LoadingButton>
                    <button
                        className="lb-outline-secondary flex gap-2 px-4"
                        onClick={() => onCancel()}
                    >
                        {t("Cancel")}
                    </button>
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
    const { data: llms } = useLLMs();
    const [llm, setLLM] = useState("");
    const { t } = useTranslation();

    useEffect(() => {
        if (selectedPrompt) {
            setTitle(selectedPrompt.title);
            setPrompt(selectedPrompt.text);
            setLLM(
                selectedPrompt?.llm &&
                    llms?.some((l) => l._id === selectedPrompt.llm)
                    ? selectedPrompt?.llm
                    : llms?.find((l) => l.isDefault)?._id,
            );
        } else {
            setTitle("");
            setPrompt("");
            setLLM(llms?.find((l) => l.isDefault)?._id);
        }
    }, [selectedPrompt, llms]);
    const isOwner = selectedPrompt?.owner?.toString() === user._id?.toString();

    const isPublished = workspace?.published;

    return (
        <div className="p-1">
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="lb-input mb-2"
                placeholder={t("Enter a title for the prompt")}
            />
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="lb-input mb-2"
                rows={5}
                type="text"
                placeholder={t("Enter a prompt here to run against the input")}
            />
            <div className="flex gap-3 items-start mb-4">
                <label className="text-sm text-gray-500 mt-2">
                    {t("Model")}
                </label>
                <div>
                    <select
                        className="lb-select mb-1"
                        value={llm}
                        onChange={(e) => setLLM(e.target.value)}
                        disabled={isPublished}
                    >
                        {llms?.map((llm) => (
                            <option key={llm._id} value={llm._id}>
                                {llm.name}
                            </option>
                        ))}
                    </select>

                    {isPublished && (
                        <div className="text-xs text-gray-400 mb-4">
                            {t(
                                "The model cannot be modified because this workspace is published to Cortex.",
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex justify-between gap-2">
                <LoadingButton
                    text={t("Deleting") + "..."}
                    className="lb-outline-danger"
                    disabled={updatePrompt.isPending}
                    onClick={async () => {
                        if (
                            window.confirm(
                                t(
                                    "Are you sure you want to delete this prompt?",
                                ),
                            )
                        ) {
                            await deletePrompt.mutateAsync({
                                id: selectedPrompt._id,
                                workspaceId: workspace._id,
                            });
                            onBack();
                        }
                    }}
                >
                    {t("Delete")}
                </LoadingButton>
                <div className="flex gap-2">
                    <LoadingButton
                        loading={updatePrompt.isPending}
                        text={t("Saving") + "..."}
                        className="lb-primary flex justify-center gap-2 px-4"
                        disabled={!prompt || !title}
                        onClick={async () => {
                            if (selectedPrompt && isOwner) {
                                await updatePrompt.mutateAsync({
                                    id: selectedPrompt._id,
                                    workspaceId: workspace._id,
                                    data: {
                                        title,
                                        text: prompt,
                                        llm,
                                    },
                                });
                                onBack();
                            } else {
                                await createPrompt.mutateAsync({
                                    workspace,
                                    prompt: {
                                        title,
                                        text: prompt,
                                        llm,
                                    },
                                });
                                onBack();
                            }
                        }}
                    >
                        {t("Save")}
                    </LoadingButton>
                    <button
                        className="lb-outline-secondary flex gap-2 px-4"
                        disabled={updatePrompt.isPending}
                        onClick={onBack}
                    >
                        {t("Cancel")}
                    </button>
                </div>
                {deletePrompt.isError ||
                    (updatePrompt.isError && (
                        <div className="text-red-500">
                            {t("Error saving prompt")}:
                            {deletePrompt.error?.response?.data?.message ||
                                updatePrompt.error?.response?.data?.message}
                        </div>
                    ))}
            </div>
        </div>
    );
}
