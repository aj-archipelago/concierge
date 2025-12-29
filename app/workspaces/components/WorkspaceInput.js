import { Edit, FolderOpen, Paperclip, X } from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { useQueryClient } from "@tanstack/react-query";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { workspaceMarkdownComponents } from "./markdownComponents";
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
import MarkdownEditor from "./MarkdownEditor";
import FileManager from "../../../src/components/common/FileManager";
import UserFileCollectionPicker from "../[id]/components/UserFileCollectionPicker";
import { useHashToIdLookup } from "../hooks/useHashToIdLookup";
import AttachedFilesList from "./AttachedFilesList";

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
    const [showCortexFilePicker, setShowCortexFilePicker] = useState(false);

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

    // Remove file handler - just detaches from input (does NOT delete from cloud)
    const removeFile = useCallback((indexToRemove) => {
        setUrlsData((prevUrlsData) =>
            prevUrlsData.filter((_, index) => index !== indexToRemove),
        );
    }, []);

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

        return files;
    }, [urlsData]);

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
                                urlsData.length > 0
                                    ? "pb-20 h-[175px]"
                                    : "h-full"
                            }`}
                        />

                        {/* File upload and attach buttons overlaid at top right */}
                        <div className="absolute top-2 right-2 flex gap-1">
                            <button
                                type="button"
                                onClick={() => setShowCortexFilePicker(true)}
                                className="lb-outline-secondary flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-sm"
                                title={t("Attach files")}
                            >
                                <Paperclip className="w-3 h-3 text-gray-500" />
                                <span className="text-xs font-medium">
                                    {t("Attach")}
                                </span>
                            </button>
                        </div>

                        {/* Attached files overlaid at bottom of text area */}
                        {urlsData.length > 0 && (
                            <div className="absolute bottom-4 left-2 right-2 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200 dark:border-gray-600 rounded-md p-2 shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <Paperclip className="w-3 h-3 text-gray-500" />
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                        Run prompt with {urlsData.length}{" "}
                                        {t("file(s)")}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
                                    {urlsData.map((fileData, index) => {
                                        const fileName =
                                            fileData.displayFilename ||
                                            fileData.url?.split("/").pop() ||
                                            `File ${index + 1}`;
                                        const Icon = getFileIcon(fileName);
                                        return (
                                            <div
                                                key={index}
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
                            inputValid={!!(text || urlsData.length > 0)}
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
                                if (text || urlsData.length > 0) {
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

            {/* Files Management Dialog */}
            <WorkspaceFilesDialog
                isOpen={showFilesDialog}
                onClose={() => setShowFilesDialog(false)}
                workspaceId={workspace?._id}
            />

            {/* Cortex File Picker Modal */}
            <Modal
                show={showCortexFilePicker}
                onHide={() => setShowCortexFilePicker(false)}
                title={t("Attach Files")}
                widthClassName="max-w-2xl"
            >
                <div className="p-4">
                    {workspace?._id && user?.contextId && (
                        <UserFileCollectionPicker
                            contextId={`${workspace._id}:${user.contextId}`}
                            contextKey={user.contextKey}
                            selectedFiles={urlsData}
                            onFilesSelected={(selected) => {
                                // Convert Cortex file format to urlsData format
                                const newUrlsData = selected.map((file) => ({
                                    url: file.url || file.gcs,
                                    gcs: file.gcs,
                                    hash: file.hash,
                                    displayFilename:
                                        file.displayFilename ||
                                        file.filename ||
                                        file.originalName,
                                }));
                                setUrlsData(newUrlsData);
                            }}
                        />
                    )}
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                        <button
                            type="button"
                            onClick={() => setShowCortexFilePicker(false)}
                            className="lb-primary px-4 py-2"
                        >
                            {t("Done")}
                        </button>
                    </div>
                </div>
            </Modal>
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
                    <div className="text-gray-500 dark:text-gray-400 text-xs max-h-[200px] overflow-auto markdown-content">
                        <Markdown
                            remarkPlugins={[remarkGfm]}
                            components={workspaceMarkdownComponents}
                        >
                            {value}
                        </Markdown>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SystemPromptEditor({ value, onCancel, onSave }) {
    const [prompt, setPrompt] = useState(value);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const updateWorkspace = useUpdateWorkspace();
    const { workspace } = useContext(WorkspaceContext);
    const { t } = useTranslation();

    return (
        <div className="p-1">
            <MarkdownEditor
                value={prompt}
                onChange={setPrompt}
                placeholder={t(
                    "e.g. You are an expert journalist working at Al Jazeera Media Network.",
                )}
                className="mb-2"
            />
            <div className="flex justify-between gap-2 mt-3">
                <LoadingButton
                    text={t("Deleting") + "..."}
                    className="lb-outline-danger"
                    onClick={() => setShowDeleteConfirm(true)}
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

            <AlertDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader
                        className={
                            i18next.language === "ar" ? "text-right" : ""
                        }
                    >
                        <AlertDialogTitle>
                            {t("Delete System Prompt")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete this system prompt? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter
                        className={
                            i18next.language === "ar"
                                ? "flex-row-reverse sm:flex-row-reverse"
                                : ""
                        }
                    >
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                await updateWorkspace.mutateAsync({
                                    id: workspace?._id,
                                    data: { systemPrompt: "" },
                                });
                                onCancel();
                                setShowDeleteConfirm(false);
                            }}
                        >
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function PromptEditor({ selectedPrompt, onBack }) {
    const [title, setTitle] = useState("");
    const [prompt, setPrompt] = useState("");
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [showFilePicker, setShowFilePicker] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const updatePrompt = useUpdatePrompt();
    const createPrompt = useCreatePrompt();
    const deletePrompt = useDeletePrompt();
    const { user, workspace } = useContext(WorkspaceContext);
    const { data: llms } = useLLMs();
    const [llm, setLLM] = useState("");
    const [agentMode, setAgentMode] = useState(false);
    const [researchMode, setResearchMode] = useState(false);
    const { t } = useTranslation();

    // Hash -> _id lookup for matching Cortex files to MongoDB files
    const hashToId = useHashToIdLookup(workspace?._id);

    useEffect(() => {
        if (selectedPrompt) {
            setTitle(selectedPrompt.title);
            setPrompt(selectedPrompt.text);
            setAgentMode(selectedPrompt.agentMode || false);
            setResearchMode(selectedPrompt.researchMode || false);
            setLLM(
                selectedPrompt?.llm &&
                    llms?.some((l) => l._id === selectedPrompt.llm)
                    ? selectedPrompt?.llm
                    : llms?.find((l) => l.isDefault)?._id,
            );
            // Files from prompt already have hash for matching
            setSelectedFiles(selectedPrompt.files || []);
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
                <MarkdownEditor
                    value={prompt}
                    onChange={setPrompt}
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
                    <AttachedFilesList
                        files={selectedFiles}
                        onRemove={(index) =>
                            setSelectedFiles((prev) =>
                                prev.filter((_, i) => i !== index),
                            )
                        }
                        disabled={isPublished}
                    />
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
                        onClick={() => setShowDeleteConfirm(true)}
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
                            // Resolve file IDs by hash lookup or existing _id (for legacy files)
                            const fileIds = selectedFiles
                                .filter(
                                    (file) =>
                                        !file.error && (file._id || file.hash),
                                )
                                .map(
                                    (file) =>
                                        file._id || hashToId.get(file.hash),
                                )
                                .filter(Boolean);

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
                                        files: fileIds,
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
                                        files: fileIds,
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
            <Modal
                show={showFilePicker}
                onHide={() => setShowFilePicker(false)}
                title={t("Attach Files")}
                widthClassName="max-w-2xl"
            >
                <div className="p-4">
                    {workspace?._id && (
                        <UserFileCollectionPicker
                            contextId={workspace._id}
                            contextKey={workspace.contextKey}
                            selectedFiles={selectedFiles}
                            onFilesSelected={setSelectedFiles}
                        />
                    )}
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                        <button
                            type="button"
                            onClick={() => setShowFilePicker(false)}
                            className="lb-primary px-4 py-2"
                        >
                            {t("Done")}
                        </button>
                    </div>
                </div>
            </Modal>

            <AlertDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader
                        className={
                            i18next.language === "ar" ? "text-right" : ""
                        }
                    >
                        <AlertDialogTitle>
                            {t("Delete Prompt")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete this prompt? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter
                        className={
                            i18next.language === "ar"
                                ? "flex-row-reverse sm:flex-row-reverse"
                                : ""
                        }
                    >
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                await deletePrompt.mutateAsync({
                                    id: selectedPrompt._id,
                                    workspaceId: workspace._id,
                                });
                                onBack();
                                setShowDeleteConfirm(false);
                            }}
                        >
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
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
