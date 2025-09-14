import { useApolloClient } from "@apollo/client";
import {
    Edit,
    File,
    FolderOpen,
    Loader2Icon,
    Paperclip,
    Trash2,
    UploadIcon,
    X,
} from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { v4 as uuidv4 } from "uuid";
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
import { COGNITIVE_INSERT } from "../../../src/graphql";
import { useLLMs } from "../../queries/llms";
import {
    useCreatePrompt,
    useDeletePrompt,
    useUpdatePrompt,
} from "../../queries/prompts";
import { useAddDocument } from "../../queries/uploadedDocs";
import {
    useCheckFileAttachments,
    useDeleteWorkspaceFile,
    useUpdateWorkspace,
    useUpdateWorkspaceState,
    useUploadWorkspaceFile,
    useWorkspaceFiles,
    useWorkspaceState,
} from "../../queries/workspaces";
import PromptList from "./PromptList";
import PromptSelectorModal from "./PromptSelectorModal";
import { WorkspaceContext } from "./WorkspaceContent";

import {
    getFilename,
    isRagFileUrl,
    isSupportedFileUrl,
} from "../../../src/utils/mediaUtils";
import FileUploadDialog from "./FileUploadDialog";

export default function WorkspaceInput({ onRun, onRunMany }) {
    const [text, setText] = useState("");
    const [selectedPrompt, setSelectedPrompt] = useState(null);
    const [editing, setEditing] = useState(false);
    const { workspace } = useContext(WorkspaceContext);
    const [isOpen, setIsOpen] = useState(false);
    const [systemPromptEditing, setSystemPromptEditing] = useState(false);

    // File upload states
    const [showFileUploadDialog, setShowFileUploadDialog] = useState(false);
    const [urlsData, setUrlsData] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [showFilePicker, setShowFilePicker] = useState(false);
    const [, setFileUploadLoading] = useState(false);
    const [, setFileUploadError] = useState(null);

    // Files management states
    const [showFilesDialog, setShowFilesDialog] = useState(false);

    const { t } = useTranslation();
    const client = useApolloClient();
    const addDocument = useAddDocument();

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

    // Remove file handler
    const removeFile = (indexToRemove) => {
        setUrlsData((prevUrlsData) =>
            prevUrlsData.filter((_, index) => index !== indexToRemove),
        );
    };

    // File upload handler
    const handleFileUpload = (fileData) => {
        const { url, originalFilename } = fileData;
        const fetchData = async (url) => {
            if (!url) return;

            try {
                const docId = uuidv4();
                const filename = originalFilename || getFilename(url);

                setFileUploadLoading(true);
                setFileUploadError(null);

                client
                    .query({
                        query: COGNITIVE_INSERT,
                        variables: {
                            file: url,
                            privateData: true,
                            contextId: workspace?._id, // Use workspace ID as context
                            docId,
                            workspaceId: workspace?._id,
                        },
                        fetchPolicy: "network-only",
                    })
                    .then(() => {
                        // completed successfully
                        addDocument.mutateAsync({
                            docId,
                            filename,
                            workspaceId: workspace?._id,
                        });
                        setFileUploadLoading(false);
                    })
                    .catch((err) => {
                        setFileUploadLoading(false);
                        setFileUploadError(err.toString());
                    });
            } catch (err) {
                setFileUploadLoading(false);
                setFileUploadError(err.toString());
            }
        };

        //check if url is rag type and process accordingly
        if (isRagFileUrl(url)) {
            fetchData(url);
        } else if (isSupportedFileUrl(url)) {
            setUrlsData((prevUrlsData) => [...prevUrlsData, fileData]);
        } else {
            // File not processed - not RAG or supported type
        }
    };

    // Prepare files data for sending to server
    const prepareFilesData = useCallback(() => {
        const files = [];

        // Add uploaded files (urlsData)
        if (urlsData && urlsData.length > 0) {
            urlsData.forEach(
                ({ url, gcs, converted, originalFilename, hash }) => {
                    files.push({
                        url: converted?.url || url,
                        gcs: converted?.gcs || gcs,
                        originalFilename,
                        hash: hash || undefined, // Explicitly handle undefined hash
                    });
                },
            );
        }

        // Add selected workspace files (selectedFiles)
        if (selectedFiles && selectedFiles.length > 0) {
            selectedFiles.forEach((file) => {
                files.push({
                    url: file.url,
                    gcs: file.gcsUrl || file.gcs,
                    originalFilename: file.originalName || file.filename,
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
                                            fileData.originalFilename ||
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
                                    {selectedFiles.map((file, index) => (
                                        <div
                                            key={
                                                file._id || `selected-${index}`
                                            }
                                            className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded px-2 py-1 text-xs"
                                        >
                                            <File className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                            <span
                                                className="text-blue-700 dark:text-blue-300 truncate max-w-20"
                                                title={
                                                    file.originalName ||
                                                    file.filename
                                                }
                                            >
                                                {file.originalName ||
                                                    file.filename}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSelectedFiles((prev) =>
                                                        prev.filter(
                                                            (_, i) =>
                                                                i !== index,
                                                        ),
                                                    )
                                                }
                                                className="hover:bg-blue-100 dark:hover:bg-blue-800 rounded-full p-0.5"
                                                title={t("Remove file")}
                                            >
                                                <X className="w-3 h-3 text-blue-500 hover:text-red-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
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
                                <span>{t("Workspace Files")}</span>
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

            {/* File Upload Dialog */}
            <FileUploadDialog
                isOpen={showFileUploadDialog}
                onClose={() => setShowFileUploadDialog(false)}
                onFileUpload={handleFileUpload}
                title="Upload Files"
                description="Upload files to include in your workspace. Supported formats include images, documents, and media files."
            />

            {/* File Picker Modal */}
            <FilePickerModal
                isOpen={showFilePicker}
                onClose={() => setShowFilePicker(false)}
                workspaceId={workspace?._id}
                selectedFiles={selectedFiles}
                onFilesSelected={setSelectedFiles}
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
            <div className="p-1 flex gap-2">
                <h4 className="font-medium mt-1 mb-1">{t("Context")}</h4>
                <div className="flex gap-2 items-center text-sm">
                    <div className="text-gray-500 dark:text-gray-400">
                        {t("(None)")}
                    </div>
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

            <div className="overflow-auto text-start bg-gray-50 dark:bg-gray-800 p-2 rounded-md border dark:border-gray-600 w-full">
                <div className="flex gap-2 items-center justify-between w-full">
                    <div className="min-w-0 flex-1">
                        <div
                            className="truncate min-w-0 text-gray-500 dark:text-gray-400 text-xs"
                            title={value}
                        >
                            {value}
                        </div>
                    </div>
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
    const { t } = useTranslation();

    useEffect(() => {
        if (selectedPrompt) {
            setTitle(selectedPrompt.title);
            setPrompt(selectedPrompt.text);
            setSelectedFiles(selectedPrompt.files || []);
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
                        <div className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                            {t(
                                "The model cannot be modified because this workspace is published to Cortex.",
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* File Attachments Section */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-500">
                        {t("Attached Files")}
                    </label>
                    <button
                        type="button"
                        onClick={() => setShowFilePicker(true)}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        disabled={isPublished}
                    >
                        <Paperclip className="w-4 h-4" />
                        {t("Attach Files")}
                    </button>
                </div>

                {selectedFiles.length > 0 ? (
                    <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded p-2">
                        {selectedFiles.map((file, index) => (
                            <div
                                key={file._id || index}
                                className="flex items-center justify-between p-1 bg-gray-50 dark:bg-gray-700 rounded"
                            >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <File className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                                        {file.originalName || file.filename}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedFiles((prev) =>
                                            prev.filter((_, i) => i !== index),
                                        );
                                    }}
                                    className="text-gray-400 hover:text-red-500 ml-2"
                                    disabled={isPublished}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                        {t("No files attached")}
                    </div>
                )}

                {isPublished && selectedFiles.length > 0 && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {t(
                            "File attachments cannot be modified because this workspace is published to Cortex.",
                        )}
                    </div>
                )}
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
                                        files: selectedFiles.map(
                                            (file) => file._id,
                                        ),
                                    },
                                });
                                onBack();
                            } else {
                                await createPrompt.mutateAsync({
                                    workspaceId: workspace._id,
                                    prompt: {
                                        title,
                                        text: prompt,
                                        llm,
                                        files: selectedFiles.map(
                                            (file) => file._id,
                                        ),
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

            {/* File Picker Modal */}
            <FilePickerModal
                isOpen={showFilePicker}
                onClose={() => setShowFilePicker(false)}
                workspaceId={workspace?._id}
                selectedFiles={selectedFiles}
                onFilesSelected={setSelectedFiles}
            />
        </div>
    );
}

// File Picker Modal Component
function FilePickerModal({
    isOpen,
    onClose,
    workspaceId,
    selectedFiles,
    onFilesSelected,
}) {
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState(null);
    const [deletingFiles, setDeletingFiles] = useState(new Set());
    const { t } = useTranslation();
    const {
        data: filesData,
        isLoading,
        error,
    } = useWorkspaceFiles(workspaceId);
    const uploadFileMutation = useUploadWorkspaceFile();
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
        >
            <div className="p-4">
                {/* Action buttons */}
                <div className="flex justify-between items-center mb-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedFiles.length} {t("files selected")}
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setShowUploadDialog(true)}
                            className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800 px-2 py-1 border border-green-300 rounded hover:bg-green-50"
                        >
                            <UploadIcon className="w-3 h-3" />
                            {t("Upload")}
                        </button>
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            className="text-sm text-blue-600 hover:text-blue-800"
                            disabled={files.length === 0}
                        >
                            {t("Select All")}
                        </button>
                        <button
                            type="button"
                            onClick={handleDeselectAll}
                            className="text-sm text-gray-600 hover:text-gray-800"
                            disabled={selectedFiles.length === 0}
                        >
                            {t("Deselect All")}
                        </button>
                    </div>
                </div>

                {/* File list */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2Icon className="w-6 h-6 animate-spin text-gray-400" />
                        <span className="ml-2 text-sm text-gray-500">
                            {t("Loading files...")}
                        </span>
                    </div>
                ) : error ? (
                    <div className="text-center py-6">
                        <div className="text-red-600 dark:text-red-400 text-sm mb-2">
                            {t("Error loading files")}: {error.message}
                        </div>
                    </div>
                ) : files.length === 0 ? (
                    <div className="text-center py-8">
                        <File className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {t("No files found in this workspace")}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {files.map((file) => {
                            const isSelected = selectedFiles.some(
                                (f) => f._id === file._id,
                            );
                            return (
                                <div
                                    key={file._id}
                                    className={`flex items-center p-3 border rounded cursor-pointer transition-colors ${
                                        isSelected
                                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                            : "border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                                    }`}
                                    onClick={() => handleFileToggle(file)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleFileToggle(file)}
                                        className="mr-3"
                                    />
                                    <File className="w-4 h-4 text-gray-500 mr-2 flex-shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {file.originalName}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {file.size &&
                                                (file.size / 1024).toFixed(
                                                    1,
                                                )}{" "}
                                            KB
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) =>
                                            handleDeleteClick(file, e)
                                        }
                                        disabled={deletingFiles.has(file._id)}
                                        className="ml-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={t("Delete file")}
                                    >
                                        {deletingFiles.has(file._id) ? (
                                            <Loader2Icon className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

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
                uploadMutation={uploadFileMutation}
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
    const {
        data: filesData,
        isLoading,
        error,
    } = useWorkspaceFiles(workspaceId);
    const deleteFileMutation = useDeleteWorkspaceFile();
    const checkAttachmentsMutation = useCheckFileAttachments();
    const [deletingFiles, setDeletingFiles] = useState(new Set());
    const [deleteConfirmation, setDeleteConfirmation] = useState(null);
    const files = filesData?.files || [];

    const handleDeleteClick = async (file) => {
        try {
            // Check if file is attached to any prompts
            const attachmentData = await checkAttachmentsMutation.mutateAsync({
                workspaceId,
                fileId: file._id,
            });

            setDeleteConfirmation({
                file,
                isAttached: attachmentData.isAttached,
                attachedPrompts: attachmentData.attachedPrompts || [],
            });
        } catch (err) {
            console.error("Error checking file attachments:", err);
            // Fallback to simple confirmation if check fails
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
        <Modal show={isOpen} onHide={onClose} title={t("Workspace Files")}>
            <div className="p-4">
                <div className="mb-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {files.length} {t("files in workspace")}
                    </div>
                </div>

                {/* File list */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2Icon className="w-6 h-6 animate-spin text-gray-400" />
                        <span className="ml-2 text-sm text-gray-500">
                            {t("Loading files...")}
                        </span>
                    </div>
                ) : error ? (
                    <div className="text-center py-6">
                        <div className="text-red-600 dark:text-red-400 text-sm mb-2">
                            {t("Error loading files")}: {error.message}
                        </div>
                    </div>
                ) : files.length === 0 ? (
                    <div className="text-center py-8">
                        <File className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {t("No files found in this workspace")}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {files.map((file) => {
                            const isDeleting = deletingFiles.has(file._id);
                            return (
                                <div
                                    key={file._id}
                                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <File className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                {file.originalName ||
                                                    file.filename}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {file.size &&
                                                    (file.size / 1024).toFixed(
                                                        1,
                                                    )}{" "}
                                                KB
                                                {file.uploadedAt && (
                                                    <span className="ml-2">
                                                        •{" "}
                                                        {new Date(
                                                            file.uploadedAt,
                                                        ).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteClick(file)}
                                        disabled={
                                            isDeleting ||
                                            deleteFileMutation.isPending ||
                                            checkAttachmentsMutation.isPending
                                        }
                                        className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded border border-red-200 dark:border-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={t("Delete file")}
                                    >
                                        {isDeleting ? (
                                            <Loader2Icon className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-3 h-3" />
                                        )}
                                        <span>{t("Delete")}</span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

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

            {/* Enhanced Delete Confirmation Dialog */}
            <AlertDialog
                open={!!deleteConfirmation}
                onOpenChange={() => setDeleteConfirmation(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Delete File")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteConfirmation?.isAttached ? (
                                <>
                                    <div className="mb-3">
                                        <span className="font-medium text-amber-600 dark:text-amber-400">
                                            ⚠️ {t("Warning:")}
                                        </span>{" "}
                                        {t("The file")} "
                                        {deleteConfirmation?.file
                                            ?.originalName ||
                                            deleteConfirmation?.file?.filename}
                                        "{" "}
                                        {t(
                                            "is currently attached to the following prompts",
                                        )}
                                        :
                                    </div>
                                    <div className="mb-3 space-y-1 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                                        {deleteConfirmation?.attachedPrompts?.map(
                                            (prompt) => (
                                                <div
                                                    key={prompt.id}
                                                    className="text-sm font-medium text-amber-800 dark:text-amber-200"
                                                >
                                                    • {prompt.title}
                                                </div>
                                            ),
                                        )}
                                    </div>
                                    <div className="text-sm">
                                        {t(
                                            "If you proceed, the file will be automatically detached from these prompts and then deleted. This action cannot be undone.",
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    {t("Are you sure you want to delete")} "
                                    {deleteConfirmation?.file?.originalName ||
                                        deleteConfirmation?.file?.filename}
                                    "? {t("This action cannot be undone.")}
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={cancelDelete}>
                            {t("Cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                            {deleteConfirmation?.isAttached
                                ? t("Detach & Delete")
                                : t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Modal>
    );
}
