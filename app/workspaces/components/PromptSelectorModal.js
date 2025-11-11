import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Paperclip, X } from "lucide-react";
import { Modal } from "../../../@/components/ui/modal";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import { useCreatePrompt } from "../../queries/prompts";
import LLMSelector from "./LLMSelector";
import { WorkspaceContext } from "./WorkspaceContent";
import { FilePickerModal } from "./WorkspaceInput";
import { getFileIcon } from "../../../src/utils/mediaUtils";

export default function PromptSelectorModal({ isOpen, setIsOpen }) {
    const { t } = useTranslation();

    return (
        <Modal
            show={isOpen}
            onHide={() => setIsOpen(false)}
            title={t("Add a prompt to your workspace")}
        >
            <SelectorDialog setIsOpen={setIsOpen} />
        </Modal>
    );
}

function SelectorDialog({ setIsOpen }) {
    const { workspace } = useContext(WorkspaceContext);
    const [promptBeingAdded, setPromptBeingAdded] = useState(null);
    const createPrompt = useCreatePrompt();
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [llm, setLLM] = useState("");
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [showFilePicker, setShowFilePicker] = useState(false);
    const { t } = useTranslation();

    return (
        <>
            <div className="p-1">
                <div className="mb-2">
                    <label className="text-sm text-gray-500 mb-1 block">
                        {t("Title")}
                    </label>
                    <input
                        type="text"
                        value={title}
                        disabled={
                            createPrompt.isPending && promptBeingAdded === text
                        }
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
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={
                            createPrompt.isPending && promptBeingAdded === text
                        }
                        className="lb-input"
                        rows={5}
                        type="text"
                        placeholder={t(
                            "Enter a prompt here to run against the input",
                        )}
                    />
                </div>
                <div className="mb-4">
                    <label className="text-sm text-gray-500 mb-1 block">
                        {t("Model")}
                    </label>
                    <LLMSelector
                        value={llm}
                        onChange={(newValue) => {
                            setLLM(newValue);
                        }}
                    />
                </div>
                <div className="mb-6">
                    <label className="text-sm text-gray-500 mb-1 block">
                        {t("Attached Files")}
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setShowFilePicker(true)}
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
                                                            (_, i) =>
                                                                i !== index,
                                                        ),
                                                    );
                                                }}
                                                className="hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full p-0.5"
                                                title={t("Remove file")}
                                            >
                                                <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-gray-200 dark:border-gray-600">
                <LoadingButton
                    loading={
                        createPrompt.isPending && promptBeingAdded === text
                    }
                    text={t("Adding") + "..."}
                    className="lb-primary flex justify-center gap-2 px-4"
                    disabled={!title || !text}
                    onClick={async () => {
                        setPromptBeingAdded(text);
                        await createPrompt.mutateAsync({
                            workspaceId: workspace._id,
                            prompt: {
                                title,
                                text,
                                llm,
                                files: selectedFiles.map((file) => file._id),
                            },
                        });
                        setPromptBeingAdded(null);
                        setIsOpen(false);
                    }}
                >
                    {t("Add")}
                </LoadingButton>
                <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="lb-outline-secondary flex gap-2 px-4"
                    disabled={createPrompt.isPending}
                >
                    {t("Cancel")}
                </button>
            </div>

            {/* File Picker Modal */}
            <FilePickerModal
                isOpen={showFilePicker}
                onClose={() => setShowFilePicker(false)}
                workspaceId={workspace?._id}
                selectedFiles={selectedFiles}
                onFilesSelected={setSelectedFiles}
                isPublished={false}
            />
        </>
    );
}
