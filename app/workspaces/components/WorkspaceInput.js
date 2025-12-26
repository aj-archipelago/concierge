import {
    CheckSquare,
    Edit,
    File,
    FolderOpen,
    Loader2Icon,
    Paperclip,
    Square,
    Trash2,
    UploadIcon,
    X,
} from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import ModelConfiguration from "./ModelConfiguration";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../../../@/components/ui/alert-dialog";
import { Modal } from "../../../@/components/ui/modal";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import { useLLMs } from "../../queries/llms";
import {
    useCreatePrompt,
    useDeletePrompt,
    useUpdatePrompt,
} from "../../queries/prompts";
import {
    useCheckFileAttachments,
    useDeleteWorkspaceFile,
    useUpdateWorkspace,
    useUpdateWorkspaceState,
    useWorkspaceFiles,
    useWorkspaceState,
} from "../../queries/workspaces";
import PromptList from "./PromptList";
import PromptSelectorModal from "./PromptSelectorModal";
import { WorkspaceContext } from "./WorkspaceContent";

import { isSupportedFileUrl, getFileIcon } from "../../../src/utils/mediaUtils";
import FileUploadDialog from "./FileUploadDialog";
import FileManager from "../../../src/components/common/FileManager";
import { deleteFileFromCloud } from "../[id]/components/chatFileUtils";

export default function WorkspaceInput({ onRun, onRunMany }) {
    const [text, setText] = useState("");
    const [selectedPrompt, setSelectedPrompt] = useState(null);
    const [editing, setEditing] = useState(false);
    const { workspace, user } = useContext(WorkspaceContext);
    const [isOpen, setIsOpen] = useState(false);
    const [systemPromptEditing, setSystemPromptEditing] = useState(false);

    // File upload states
    const [showFileUploadDialog, setShowFileUploadDialog] = useState(false);
    const [urlsData, setUrlsData] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [showFilePicker, setShowFilePicker] = useState(false);

    // Files management states
    const [showFilesDialog, setShowFilesDialog] = useState(false);

    const { t } = useTranslation();

    const { data: workspaceState, isStateLoading } = useWorkspaceState(
        workspace?._id,
    );
    const updateWorkspaceState = useUpdateWorkspaceState();
    const updateWorkspace = useUpdateWorkspace();
    const { data: workspaceFilesData } = useWorkspaceFiles(workspace?._id);
    const promptIds =
        workspace?.prompts?.map((prompt) => prompt._id || prompt) || [];
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

    // Remove file handler - deletes from cloud storage and removes from local state
    const removeFile = useCallback(
        (indexToRemove) => {
            const fileToRemove = urlsData[indexToRemove];
            if (fileToRemove?.hash) {
                // User files in workspace use compound contextId
                const contextId =
                    workspace?._id && user?.contextId
                        ? `${workspace._id}:${user.contextId}`
                        : user?.contextId;
                deleteFileFromCloud(fileToRemove.hash, contextId);
            }
            setUrlsData((prevUrlsData) =>
                prevUrlsData.filter((_, index) => index !== indexToRemove),
            );
        },
        [urlsData, workspace?._id, user?.contextId],
    );

    // File upload handler
    const handleFileUpload = (fileData) => {
        const { url } = fileData;

        // Only add supported files to urlsData
        if (isSupportedFileUrl(url)) {
            setUrlsData((prevUrlsData) => [...prevUrlsData, fileData]);
        }
    };

    // Prepare files data for sending to server
    const prepareFilesData = useCallback(() => {
        const files = [];

        // Add uploaded files (urlsData)
        if (urlsData && urlsData.length > 0) {
            urlsData.forEach(({ url, gcs, converted, hash }) => {
                files.push({
                    url: converted?.url || url,
                    gcs: converted?.gcs || gcs,
                    hash: hash || undefined, // Explicitly handle undefined hash
                });
            });
        }

        // Add selected workspace files (selectedFiles) - filter out errored files
        if (selectedFiles && selectedFiles.length > 0) {
            selectedFiles
                .filter((file) => !file.error) // Exclude errored files
                .forEach((file) => {
                    files.push({
                        url: file.url,
                        gcs: file.gcsUrl || file.gcs,
                        _id: file._id,
                        hash: file.hash || undefined, // Explicitly handle undefined hash
                    });
                });
        }

        return files;
    }, [urlsData, selectedFiles]);

    // Enhanced run handlers that pass text and files to server
    const handleRunWithMultimodal = useCallback(
        async (text, prompt) => {
            const files = prepareFilesData();
            await onRun(text, prompt, files);
        },
        [prepareFilesData, onRun],
    );

    const handleRunManyWithMultimodal = useCallback(
        (text, promptIds) => async () => {
            const files = prepareFilesData();
            await onRunMany(text, promptIds, files)();
        },
        [prepareFilesData, onRunMany],
    );

    if (isStateLoading || !workspace) {
        return null;
    }

    return (
        <div className="h-full overflow-auto flex flex-col gap-2">
            <>
                <div className="basis-4/12 min-h-[150px] max-h-[200px] flex flex-col gap-3 p-1 overflow-auto">
                    {/* Text input with overlaid attach button and files */}
                    <div className="h-full relative">
                        {/* Text area */}
                        <textarea
                            placeholder={t(
                                "Enter some text here or upload files...",
                            )}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={8}
                            className={`lb-input w-full pe-12 ${
                                urlsData.length > 0 || selectedFiles.length > 0
                                    ? "pb-20 h-[175px]"
                                    : "h-full"
                            }`}
                        />

                        {/* File upload and attach buttons overlaid at top right */}
                        <div className="absolute top-2 right-2 flex gap-1">
                            <button
                                type="button"
                                onClick={() => setShowFileUploadDialog(true)}
                                className="lb-outline-secondary flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-sm"
                                title={t("Upload file")}
                            >
                                <Paperclip className="w-3 h-3 text-gray-500" />
                                <span className="text-xs font-medium">
                                    {t("Attach")}
                                </span>
                            </button>
                        </div>

                        {/* Attached files overlaid at bottom of text area */}
                        {(urlsData.length > 0 || selectedFiles.length > 0) && (
                            <div className="absolute bottom-4 left-2 right-2 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200 dark:border-gray-600 rounded-md p-2 shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <Paperclip className="w-3 h-3 text-gray-500" />
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                        Run prompt with{" "}
                                        {urlsData.length + selectedFiles.length}{" "}
                                        {t("file(s)")}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
                                    {urlsData.map((fileData, index) => {
                                        const fileName =
                                            fileData.displayFilename ||
                                            fileData.url?.split("/").pop() ||
                                            `File ${index + 1}`;
                                        return (
                                            <div
                                                key={index}
                                                className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs"
                                            >
                                                <File className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                                <span
                                                    className="text-gray-700 dark:text-gray-300 truncate max-w-20"
                                                    title={fileName}
                                                >
                                                    {fileName}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeFile(index)
                                                    }
                                                    className="hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full p-0.5"
                                                    title={t("Remove file")}
                                                >
                                                    <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {selectedFiles.map((file, index) => {
                                        const fileName =
                                            file.originalName || file.filename;
                                        const Icon = getFileIcon(fileName);
                                        return (
                                            <div
                                                key={
                                                    file._id ||
                                                    `selected-${index}`
                                                }
                                                className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs"
                                            >
                                                <Icon className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                                <span
                                                    className="text-gray-700 dark:text-gray-300 truncate max-w-20"
                                                    title={fileName}
                                                >
                                                    {fileName}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedFiles(
                                                            (prev) =>
                                                                prev.filter(
                                                                    (_, i) =>
                                                                        i !==
                                                                        index,
                                                                ),
                                                        )
                                                    }
                                                    className="hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full p-0.5"
                                                    title={t("Remove file")}
                                                >
                                                    <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Separator */}
                <div className="border-t border-gray-200 dark:border-gray-600"></div>

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
                            inputValid={
                                !!(
                                    text ||
                                    urlsData.length > 0 ||
                                    selectedFiles.length > 0
                                )
                            }
                            promptIds={promptIds}
                            onNew={() => {
                                setIsOpen(true);
                            }}
                            onRunAll={() => {
                                return handleRunManyWithMultimodal(
                                    text,
                                    promptIds,
                                )();
                            }}
                            onRun={async (prompt) => {
                                if (
                                    text ||
                                    urlsData.length > 0 ||
                                    selectedFiles.length > 0
                                ) {
                                    await handleRunWithMultimodal(text, prompt);
                                } else {
                                    // No input or files to process
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

                    {/* Files Button */}
                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <button
                            type="button"
                            onClick={() => setShowFilesDialog(true)}
                            className="w-full flex items-center justify-between p-3 text-left text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <FolderOpen className="w-4 h-4" />
                                <span>{t("Manage Workspace Files")}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full text-xs font-medium">
                                    {workspaceFilesData?.files?.length || 0}
                                </span>
                            </div>
                        </button>
                    </div>
                </div>
            </>
            <PromptSelectorModal isOpen={isOpen} setIsOpen={setIsOpen} />

            {/* File Upload Dialog for user files */}
            <FileUploadDialog
                isOpen={showFileUploadDialog}
                onClose={() => setShowFileUploadDialog(false)}
                onFileUpload={handleFileUpload}
                workspaceId={workspace?._id}
                title="Upload Files"
                description="Upload files to include with your input. These are your private files for this workspace."
            />

            {/* File Picker Modal */}
            <FilePickerModal
                isOpen={showFilePicker}
                onClose={() => setShowFilePicker(false)}
                workspaceId={workspace?._id}
                selectedFiles={selectedFiles}
                onFilesSelected={setSelectedFiles}
                isPublished={workspace?.published}
            />

            {/* Files Management Dialog */}
            <WorkspaceFilesDialog
                isOpen={showFilesDialog}
                onClose={() => setShowFilesDialog(false)}
                workspaceId={workspace?._id}
            />
        </div>
    );
}

function SystemPrompt({ editing, setEditing }) {
    const { t } = useTranslation();
    const { workspace, isOwner } = useContext(WorkspaceContext);
    const value = workspace?.systemPrompt;

    if (!value && !editing) {
        return (
            <div className="p-1">
                <div className="w-full text-start bg-gray-50 dark:bg-gray-800 rounded-md border dark:border-gray-600">
                    <div className="p-2">
                        <div className="flex gap-2 items-center justify-between mb-1">
                            <div className="font-medium">{t("Context")}</div>
                            {isOwner && (
                                <div
                                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 active:text-gray-900 dark:active:text-gray-200 cursor-pointer"
                                    onClick={(e) => {
                                        setEditing(true);
                                    }}
                                    title={t("Edit prompt")}
                                >
                                    <Edit />
                                </div>
                            )}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 text-xs">
                            {t("(None)")}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-1">
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
            <div className="w-full text-start bg-gray-50 dark:bg-gray-800 rounded-md border dark:border-gray-600">
                <div className="p-2">
                    <div className="flex gap-2 items-center justify-between mb-1">
                        <div className="font-medium">{t("Context")}</div>
                        {isOwner && (
                            <div
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 active:text-gray-900 dark:active:text-gray-200 cursor-pointer"
                                onClick={(e) => {
                                    setEditing(true);
                                }}
                                title={t("Edit prompt")}
                            >
                                <Edit />
                            </div>
                        )}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs whitespace-pre-wrap break-words">
                        {value}
                    </div>
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
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [showFilePicker, setShowFilePicker] = useState(false);
    const updatePrompt = useUpdatePrompt();
    const createPrompt = useCreatePrompt();
    const deletePrompt = useDeletePrompt();
    const { user, workspace } = useContext(WorkspaceContext);
    const { data: llms } = useLLMs();
    const [llm, setLLM] = useState("");
    const [agentMode, setAgentMode] = useState(false);
    const [researchMode, setResearchMode] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        if (selectedPrompt) {
            setTitle(selectedPrompt.title);
            setPrompt(selectedPrompt.text);
            setSelectedFiles(selectedPrompt.files || []);
            setAgentMode(selectedPrompt.agentMode || false);
            setResearchMode(selectedPrompt.researchMode || false);
            setLLM(
                selectedPrompt?.llm &&
                    llms?.some((l) => l._id === selectedPrompt.llm)
                    ? selectedPrompt?.llm
                    : llms?.find((l) => l.isDefault)?._id,
            );
        } else {
            setTitle("");
            setPrompt("");
            setSelectedFiles([]);
            setAgentMode(false);
            setResearchMode(false);
            setLLM(llms?.find((l) => l.isDefault)?._id);
        }
    }, [selectedPrompt, llms]);
    const isOwner = selectedPrompt?.owner?.toString() === user._id?.toString();

    const isPublished = workspace?.published;

    return (
        <div className="p-1">
            <div className="mb-2">
                <label className="text-sm text-gray-500 mb-1 block">
                    {t("Title")}
                </label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="lb-input"
                    placeholder={t("Enter a title for the prompt")}
                />
            </div>
            <div className="mb-2">
                <label className="text-sm text-gray-500 mb-1 block">
                    {t("Prompt")}
                </label>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="lb-input"
                    rows={5}
                    type="text"
                    placeholder={t(
                        "Enter a prompt here to run against the input",
                    )}
                />
            </div>

            <ModelConfiguration
                llm={llm}
                setLLM={setLLM}
                agentMode={agentMode}
                setAgentMode={setAgentMode}
                researchMode={researchMode}
                setResearchMode={setResearchMode}
                disabled={isPublished}
                showPublishedWarning={isPublished}
            />

            {/* File Attachments Section */}
            <div className="mb-6">
                <label className="text-sm text-gray-500 mb-1 block">
                    {t("Attached Files")}
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setShowFilePicker(true)}
                        disabled={isPublished}
                        className="lb-outline-secondary flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-sm"
                        title={t("Attach files")}
                    >
                        <Paperclip className="w-3 h-3 text-gray-500" />
                        <span className="text-xs font-medium">
                            {t("Attach")}
                        </span>
                    </button>
                    {selectedFiles.length > 0 && (
                        <>
                            {selectedFiles.map((file, index) => {
                                const fileName =
                                    file.originalName || file.filename;
                                const Icon = getFileIcon(fileName);
                                return (
                                    <div
                                        key={file._id || index}
                                        className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs"
                                    >
                                        <Icon className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                        <span
                                            className="text-gray-700 dark:text-gray-300 truncate max-w-20"
                                            title={fileName}
                                        >
                                            {fileName}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedFiles((prev) =>
                                                    prev.filter(
                                                        (_, i) => i !== index,
                                                    ),
                                                );
                                            }}
                                            className="hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full p-0.5"
                                            title={t("Remove file")}
                                            disabled={isPublished}
                                        >
                                            <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                                        </button>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
                {isPublished && selectedFiles.length > 0 && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {t(
                            "File attachments cannot be modified because this workspace is published to Cortex.",
                        )}
                    </div>
                )}
            </div>

            {(deletePrompt.isError || updatePrompt.isError) && (
                <div className="text-red-500 mb-2">
                    {t("Error saving prompt")}:
                    {deletePrompt.error?.response?.data?.message ||
                        updatePrompt.error?.response?.data?.message}
                </div>
            )}
            <div className="flex justify-between gap-2 mt-2 pt-4 border-t border-gray-200 dark:border-gray-600">
                {selectedPrompt && isOwner && (
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
                )}
                <div className="flex gap-2 ml-auto">
                    <LoadingButton
                        loading={updatePrompt.isPending}
                        text={t("Saving") + "..."}
                        className="lb-primary flex justify-center gap-2 px-4"
                        disabled={
                            !prompt || !title || (selectedPrompt && !isOwner)
                        }
                        onClick={async () => {
                            if (selectedPrompt && isOwner) {
                                await updatePrompt.mutateAsync({
                                    id: selectedPrompt._id,
                                    workspaceId: workspace._id,
                                    data: {
                                        title,
                                        text: prompt,
                                        llm,
                                        agentMode,
                                        researchMode,
                                        files: selectedFiles
                                            .filter((file) => !file.error)
                                            .map((file) => file._id),
                                    },
                                });
                                onBack();
                            } else if (!selectedPrompt) {
                                await createPrompt.mutateAsync({
                                    workspaceId: workspace._id,
                                    prompt: {
                                        title,
                                        text: prompt,
                                        llm,
                                        agentMode,
                                        researchMode,
                                        files: selectedFiles
                                            .filter((file) => !file.error)
                                            .map((file) => file._id),
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
            </div>

            {/* File Picker Modal */}
            <FilePickerModal
                isOpen={showFilePicker}
                onClose={() => setShowFilePicker(false)}
                workspaceId={workspace?._id}
                selectedFiles={selectedFiles}
                onFilesSelected={setSelectedFiles}
                isPublished={isPublished}
            />
        </div>
    );
}

// Shared File List Component
function FileList({
    files,
    isLoading,
    error,
    getFileIcon,
    isPickerMode = false,
    selectedFiles = [],
    onFileToggle,
    deletingFiles = new Set(),
    onDeleteClick,
    isPublished = false,
    emptyMessage,
}) {
    const { t } = useTranslation();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2Icon className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">
                    {t("Loading files...")}
                </span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-6">
                <div className="text-red-600 dark:text-red-400 text-sm mb-2">
                    {t("Error loading files")}: {error.message}
                </div>
            </div>
        );
    }

    if (files.length === 0) {
        return (
            <div className="text-center py-8">
                <File className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {emptyMessage || t("No files found in this workspace")}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2 max-h-96 overflow-y-auto">
            {files.map((file) => {
                const Icon = getFileIcon(file.originalName || file.filename);
                const isSelected = selectedFiles.some(
                    (f) => f._id === file._id,
                );
                const isDeleting = deletingFiles.has(file._id);
                const hasError = !!file.error;

                return (
                    <div
                        key={file._id}
                        className={`flex items-center gap-2 ${
                            hasError
                                ? "opacity-60 border-red-300 dark:border-red-700"
                                : ""
                        } ${
                            isPickerMode
                                ? `p-2 border rounded cursor-pointer transition-colors ${
                                      isSelected
                                          ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                                          : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                                  }`
                                : "justify-between p-2 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                        onClick={
                            isPickerMode && !hasError
                                ? () => onFileToggle(file)
                                : undefined
                        }
                    >
                        {isPickerMode && (
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => onFileToggle(file)}
                                disabled={hasError}
                                className="w-4 h-4 flex-shrink-0 self-center disabled:opacity-50"
                            />
                        )}
                        <Icon
                            className={`w-6 h-6 flex-shrink-0 ${
                                hasError
                                    ? "text-red-500 dark:text-red-400"
                                    : "text-gray-500"
                            }`}
                        />
                        <div className="min-w-0 flex-1 flex items-baseline gap-2">
                            <span
                                className={`text-sm font-medium truncate ${
                                    hasError
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-gray-900 dark:text-gray-100"
                                }`}
                                title={hasError ? file.error : undefined}
                            >
                                {file.originalName || file.filename}
                                {hasError && (
                                    <span className="ml-1 text-xs">
                                        ({t("Error")})
                                    </span>
                                )}
                            </span>
                            {isPickerMode && file.size && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0 leading-normal">
                                    {(file.size / 1024).toFixed(1)} KB
                                </span>
                            )}
                        </div>
                        {isPickerMode && (
                            <div className="flex-shrink-0 w-6 h-6" />
                        )}
                        {!isPickerMode && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap self-center">
                                {file.size && (file.size / 1024).toFixed(1)} KB
                                {file.uploadedAt && (
                                    <span className="ml-2">
                                        •{" "}
                                        {new Date(
                                            file.uploadedAt,
                                        ).toLocaleDateString()}
                                    </span>
                                )}
                            </span>
                        )}
                        {onDeleteClick && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteClick(file, e);
                                }}
                                disabled={isDeleting || isPublished}
                                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={
                                    isPublished
                                        ? t(
                                              "Cannot delete files because this workspace is published to Cortex",
                                          )
                                        : t("Delete file")
                                }
                            >
                                {isDeleting ? (
                                    <Loader2Icon className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// File Picker Modal Component
export function FilePickerModal({
    isOpen,
    onClose,
    workspaceId,
    selectedFiles,
    onFilesSelected,
    isPublished = false,
}) {
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState(null);
    const [deletingFiles, setDeletingFiles] = useState(new Set());
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const {
        data: filesData,
        isLoading,
        error,
    } = useWorkspaceFiles(workspaceId);
    const deleteFileMutation = useDeleteWorkspaceFile();
    const checkFileAttachmentsMutation = useCheckFileAttachments();

    const files = filesData?.files || [];

    // Handle file upload success in the modal
    const handleFileUpload = async (fileData) => {
        try {
            // The fileData comes from the workspace upload mutation
            // and has the structure: { success: true, file: {...}, files: [...] }
            const uploadedFile = fileData?.file;

            if (uploadedFile && uploadedFile._id) {
                const isAlreadySelected = selectedFiles.some(
                    (f) => f._id === uploadedFile._id,
                );
                if (!isAlreadySelected) {
                    onFilesSelected([...selectedFiles, uploadedFile]);
                }
            }
            setShowUploadDialog(false);
        } catch (err) {
            console.error("Error after file upload:", err);
        }
    };

    const handleFileToggle = (file) => {
        const isSelected = selectedFiles.some((f) => f._id === file._id);
        if (isSelected) {
            onFilesSelected(selectedFiles.filter((f) => f._id !== file._id));
        } else {
            onFilesSelected([...selectedFiles, file]);
        }
    };

    const handleSelectAll = () => {
        onFilesSelected(files);
    };

    const handleDeselectAll = () => {
        onFilesSelected([]);
    };

    const handleDeleteClick = async (file, event) => {
        event.stopPropagation(); // Prevent file selection toggle

        try {
            // Check if file is attached to any prompts
            const attachmentData =
                await checkFileAttachmentsMutation.mutateAsync({
                    workspaceId,
                    fileId: file._id,
                });

            const isAttached = attachmentData.attachedPrompts.length > 0;

            setDeleteConfirmation({
                file,
                isAttached,
                attachedPrompts: attachmentData.attachedPrompts || [],
            });
        } catch (err) {
            console.error("Error checking file attachments:", err);
            // If check fails, proceed with basic confirmation
            setDeleteConfirmation({
                file,
                isAttached: false,
                attachedPrompts: [],
            });
        }
    };

    const confirmDelete = async () => {
        if (!deleteConfirmation) return;

        const { file, isAttached } = deleteConfirmation;

        try {
            setDeletingFiles((prev) => new Set(prev).add(file._id));
            await deleteFileMutation.mutateAsync({
                workspaceId,
                fileId: file._id,
                force: isAttached, // Use force if attached to prompts
            });

            // Remove file from selected files if it was selected
            onFilesSelected(selectedFiles.filter((f) => f._id !== file._id));

            // If file was attached to prompts, invalidate prompt queries to reload them
            if (isAttached) {
                queryClient.invalidateQueries({ queryKey: ["prompt"] });
            }
        } catch (err) {
            console.error("Error deleting file:", err);
        } finally {
            setDeletingFiles((prev) => {
                const newSet = new Set(prev);
                newSet.delete(file._id);
                return newSet;
            });
            setDeleteConfirmation(null);
        }
    };

    const cancelDelete = () => {
        setDeleteConfirmation(null);
    };

    if (!isOpen) return null;

    return (
        <Modal
            show={isOpen}
            onHide={onClose}
            title={t("Select Files to Attach")}
            widthClassName="max-w-2xl"
        >
            <div className="p-4">
                {/* Read-only notice for published workspaces */}
                {isPublished && (
                    <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                        <div className="text-sm text-yellow-800 dark:text-yellow-200">
                            {t(
                                "This workspace is published to Cortex. You can view and select files, but cannot upload or delete files.",
                            )}
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex justify-between items-center mb-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedFiles.length} {t("files selected")}
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setShowUploadDialog(true)}
                            className="lb-outline-secondary flex items-center gap-1 px-2 py-1 text-sm"
                            disabled={isPublished}
                            title={
                                isPublished
                                    ? t(
                                          "Cannot upload files because this workspace is published to Cortex",
                                      )
                                    : t("Upload")
                            }
                        >
                            <UploadIcon className="w-3 h-3" />
                            <span className="hidden sm:inline">
                                {t("Upload")}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            className="lb-outline-secondary flex items-center gap-1 px-2 py-1 text-sm"
                            disabled={files.length === 0}
                            title={t("Select All")}
                        >
                            <CheckSquare className="w-3 h-3" />
                            <span className="hidden sm:inline">
                                {t("Select All")}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={handleDeselectAll}
                            className="lb-outline-secondary flex items-center gap-1 px-2 py-1 text-sm"
                            disabled={selectedFiles.length === 0}
                            title={t("Deselect All")}
                        >
                            <Square className="w-3 h-3" />
                            <span className="hidden sm:inline">
                                {t("Deselect All")}
                            </span>
                        </button>
                    </div>
                </div>

                {/* File list */}
                <FileList
                    files={files}
                    isLoading={isLoading}
                    error={error}
                    getFileIcon={getFileIcon}
                    isPickerMode={true}
                    selectedFiles={selectedFiles}
                    onFileToggle={handleFileToggle}
                    deletingFiles={deletingFiles}
                    onDeleteClick={handleDeleteClick}
                    isPublished={isPublished}
                />

                {/* Footer buttons */}
                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                    <button
                        type="button"
                        onClick={onClose}
                        className="lb-outline-secondary px-4 py-2"
                    >
                        {t("Cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="lb-primary px-4 py-2"
                    >
                        {t("Done")}
                    </button>
                </div>
            </div>

            {/* File Upload Dialog within the modal */}
            <FileUploadDialog
                isOpen={showUploadDialog}
                onClose={() => setShowUploadDialog(false)}
                onFileUpload={handleFileUpload}
                uploadEndpoint={`/api/workspaces/${workspaceId}/files`}
                workspaceId={workspaceId}
                title="Upload Files to Workspace"
                description="Upload files to add them to this workspace. They will be available for attachment to prompts."
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={!!deleteConfirmation}
                onOpenChange={cancelDelete}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Delete File")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteConfirmation?.isAttached ? (
                                <>
                                    {t("This file is attached to")}{" "}
                                    {deleteConfirmation.attachedPrompts.length}{" "}
                                    {t("prompt(s)")}:{" "}
                                    <strong>
                                        {deleteConfirmation.attachedPrompts
                                            .map((p) => p.title)
                                            .join(", ")}
                                    </strong>
                                    <br />
                                    <br />
                                    {t(
                                        "Deleting this file will remove it from all attached prompts. This action cannot be undone.",
                                    )}
                                </>
                            ) : (
                                t(
                                    "Are you sure you want to delete '{{fileName}}'? This action cannot be undone.",
                                    {
                                        fileName:
                                            deleteConfirmation?.file
                                                ?.originalName,
                                    },
                                )
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={cancelDelete}>
                            {t("Cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
                        >
                            {deleteFileMutation.isPending ? (
                                <>
                                    <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                                    {t("Deleting...")}
                                </>
                            ) : (
                                t("Delete")
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Modal>
    );
}

// Workspace Files Management Dialog Component
function WorkspaceFilesDialog({ isOpen, onClose, workspaceId }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const {
        data: filesData,
        isLoading,
        refetch,
    } = useWorkspaceFiles(workspaceId);
    const deleteFileMutation = useDeleteWorkspaceFile();
    const checkAttachmentsMutation = useCheckFileAttachments();
    const [pendingDeleteFiles, setPendingDeleteFiles] = useState([]);
    const [deleteConfirmation, setDeleteConfirmation] = useState(null);
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const files = filesData?.files || [];

    // Handle upload complete - refetch files
    const handleUploadComplete = useCallback(() => {
        refetch();
    }, [refetch]);

    // Actually perform the delete
    const performDelete = useCallback(
        async (filesToDelete, hasAttachments) => {
            try {
                await Promise.all(
                    filesToDelete.map((file) =>
                        deleteFileMutation.mutateAsync({
                            workspaceId,
                            fileId: file._id,
                            force: hasAttachments,
                        }),
                    ),
                );

                if (hasAttachments) {
                    queryClient.invalidateQueries({ queryKey: ["prompt"] });
                }
            } catch (err) {
                console.error("Error deleting files:", err);
            }
        },
        [workspaceId, deleteFileMutation, queryClient],
    );

    // Handle delete - this is called when user clicks delete in FileManager
    // We intercept to check for prompt attachments first
    const handleDelete = useCallback(
        async (filesToRemove) => {
            // For bulk delete, check each file for attachments
            const attachmentResults = await Promise.all(
                filesToRemove.map(async (file) => {
                    try {
                        const attachmentData =
                            await checkAttachmentsMutation.mutateAsync({
                                workspaceId,
                                fileId: file._id,
                            });
                        return {
                            file,
                            isAttached: attachmentData.isAttached,
                            attachedPrompts:
                                attachmentData.attachedPrompts || [],
                        };
                    } catch {
                        return { file, isAttached: false, attachedPrompts: [] };
                    }
                }),
            );

            const hasAttachments = attachmentResults.some((r) => r.isAttached);

            if (hasAttachments) {
                // Show confirmation dialog for files with attachments
                setPendingDeleteFiles(filesToRemove);
                setDeleteConfirmation({
                    files: attachmentResults,
                    hasAttachments: true,
                    totalCount: filesToRemove.length,
                    attachedCount: attachmentResults.filter((r) => r.isAttached)
                        .length,
                });
            } else {
                // No attachments, delete directly
                await performDelete(filesToRemove, false);
            }
        },
        [workspaceId, checkAttachmentsMutation, performDelete],
    );

    const confirmDelete = async () => {
        if (!deleteConfirmation || pendingDeleteFiles.length === 0) return;
        await performDelete(
            pendingDeleteFiles,
            deleteConfirmation.hasAttachments,
        );
        setPendingDeleteFiles([]);
        setDeleteConfirmation(null);
        await refetch();
    };

    const cancelDelete = () => {
        setPendingDeleteFiles([]);
        setDeleteConfirmation(null);
    };

    if (!isOpen) return null;

    return (
        <Modal
            show={isOpen}
            onHide={onClose}
            title={t("Manage Workspace Files")}
            widthClassName="max-w-4xl"
        >
            <div className="p-4">
                <FileManager
                    files={files}
                    isLoading={isLoading}
                    onRefetch={refetch}
                    onDelete={handleDelete}
                    onUploadClick={() => setShowUploadDialog(true)}
                    emptyTitle={t("No files in workspace")}
                    emptyDescription={t(
                        "Upload files to this workspace to use them in prompts.",
                    )}
                    showPermanentColumn={false}
                    showDateColumn={true}
                    enableFilenameEdit={false}
                    enableHoverPreview={true}
                    enableBulkActions={true}
                    enableFilter={true}
                    enableSort={true}
                    optimisticDelete={false}
                    containerHeight="400px"
                />

                {/* Footer */}
                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                    <button
                        type="button"
                        onClick={onClose}
                        className="lb-outline-secondary px-4 py-2"
                    >
                        {t("Close")}
                    </button>
                </div>
            </div>

            {/* Reuse existing FileUploadDialog for workspace uploads */}
            <FileUploadDialog
                isOpen={showUploadDialog}
                onClose={() => setShowUploadDialog(false)}
                onFileUpload={handleUploadComplete}
                uploadEndpoint={`/api/workspaces/${workspaceId}/files`}
                workspaceId={workspaceId}
                title="Upload Workspace Files"
                description="Upload files to use in this workspace's prompts."
            />

            {/* Enhanced Delete Confirmation Dialog for files attached to prompts */}
            <AlertDialog
                open={!!deleteConfirmation}
                onOpenChange={() => cancelDelete()}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {deleteConfirmation?.totalCount > 1
                                ? t("Delete Files")
                                : t("Delete File")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteConfirmation?.hasAttachments ? (
                                <>
                                    <div className="mb-3">
                                        <span className="font-medium text-amber-600 dark:text-amber-400">
                                            ⚠️ {t("Warning:")}
                                        </span>{" "}
                                        {deleteConfirmation?.attachedCount === 1
                                            ? t("1 file is attached to prompts")
                                            : t(
                                                  "{{count}} files are attached to prompts",
                                                  {
                                                      count: deleteConfirmation?.attachedCount,
                                                  },
                                              )}
                                        .
                                    </div>
                                    <div className="mb-3 space-y-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800 max-h-48 overflow-y-auto">
                                        {deleteConfirmation?.files
                                            ?.filter((r) => r.isAttached)
                                            .map((result) => (
                                                <div
                                                    key={result.file._id}
                                                    className="text-sm"
                                                >
                                                    <span className="font-medium text-amber-800 dark:text-amber-200">
                                                        {result.file
                                                            .originalName ||
                                                            result.file
                                                                .filename}
                                                    </span>
                                                    <span className="text-amber-600 dark:text-amber-400">
                                                        {" "}
                                                        →{" "}
                                                        {result.attachedPrompts
                                                            .map((p) => p.title)
                                                            .join(", ")}
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                    <div className="text-sm">
                                        {t(
                                            "If you proceed, files will be automatically detached from prompts and then deleted. This action cannot be undone.",
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    {t(
                                        "Are you sure you want to delete {{count}} file(s)? This action cannot be undone.",
                                        {
                                            count: deleteConfirmation?.totalCount,
                                        },
                                    )}
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={cancelDelete}>
                            {t("Cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>
                            {deleteConfirmation?.hasAttachments
                                ? t("Detach & Delete")
                                : t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Modal>
    );
}
