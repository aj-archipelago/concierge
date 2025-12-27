import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Paperclip } from "lucide-react";
import { Modal } from "../../../@/components/ui/modal";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import { useCreatePrompt } from "../../queries/prompts";
import { WorkspaceContext } from "./WorkspaceContent";
import UserFileCollectionPicker from "../[id]/components/UserFileCollectionPicker";
import ModelConfiguration from "./ModelConfiguration";
import { useHashToIdLookup } from "../hooks/useHashToIdLookup";
import AttachedFilesList from "./AttachedFilesList";

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
    const [agentMode, setAgentMode] = useState(false);
    const [researchMode, setResearchMode] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [showFilePicker, setShowFilePicker] = useState(false);
    const { t } = useTranslation();

    // Hash -> _id lookup for matching Cortex files to MongoDB files
    const hashToId = useHashToIdLookup(workspace?._id);

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

                <ModelConfiguration
                    llm={llm}
                    setLLM={setLLM}
                    agentMode={agentMode}
                    setAgentMode={setAgentMode}
                    researchMode={researchMode}
                    setResearchMode={setResearchMode}
                />

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
                        <AttachedFilesList
                            files={selectedFiles}
                            onRemove={(index) =>
                                setSelectedFiles((prev) =>
                                    prev.filter((_, i) => i !== index),
                                )
                            }
                        />
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
                        // Resolve file IDs by hash lookup
                        const fileIds = selectedFiles
                            .filter((file) => file.hash)
                            .map((file) => file._id || hashToId.get(file.hash))
                            .filter(Boolean);

                        setPromptBeingAdded(text);
                        await createPrompt.mutateAsync({
                            workspaceId: workspace._id,
                            prompt: {
                                title,
                                text,
                                llm,
                                agentMode,
                                researchMode,
                                files: fileIds,
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
        </>
    );
}
