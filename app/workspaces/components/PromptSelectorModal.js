import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../../@/components/ui/modal";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import {
    useCreatePrompt,
    usePromptLibrary,
    usePromptsByIds,
} from "../../queries/prompts";
import classNames from "../../utils/class-names";
import LLMSelector from "./LLMSelector"; // Add this import
import { WorkspaceContext } from "./WorkspaceContent";

export default function PromptSelectorModal({ isOpen, setIsOpen }) {
    const { t } = useTranslation();

    return (
        <Modal
            show={isOpen}
            onHide={() => setIsOpen(false)}
            title={t("Add a prompt to your workspace")}
        >
            <SelectorDialog setIsOpen={setIsOpen} />

            <div className="mt-4 flex justify-end">
                <button
                    type="button"
                    className="lb-primary w-40 flex justify-center py-2"
                    onClick={() => {
                        setIsOpen(false);
                    }}
                >
                    {t("Close")}
                </button>
            </div>
        </Modal>
    );
}

function SelectorDialog({ setIsOpen }) {
    const { data: promptLibrary } = usePromptLibrary();

    const { workspace } = useContext(WorkspaceContext);
    const { data: workspacePrompts } = usePromptsByIds(
        workspace?.prompts || [],
    );
    const [promptBeingAdded, setPromptBeingAdded] = useState(null);
    const createPrompt = useCreatePrompt();
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [llm, setLLM] = useState("");
    const [addedLast, setAddedLast] = useState(null);
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("write_your_own");

    return (
        <>
            <Tabs
                className="w-full flex flex-col gap-2 h-full"
                value={activeTab}
                onValueChange={(value) => setActiveTab(value)}
            >
                <TabsList className="w-full block sm:hidden">
                    <TabsTrigger value="write_your_own" className="w-1/2">
                        {t("Write your own")}
                    </TabsTrigger>
                    <TabsTrigger value="pick_from_library" className="w-1/2">
                        {t("Pick from library")}
                    </TabsTrigger>
                </TabsList>
                <div className="flex gap-4 grow overflow-auto p-1 ">
                    <div
                        className={classNames(
                            activeTab === "write_your_own"
                                ? "block"
                                : "hidden sm:block",
                            "grow sm:basis-6/12",
                        )}
                    >
                        <h4 className="mb-2">{t("Write your own prompt")}</h4>
                        <div>
                            <input
                                type="text"
                                value={title}
                                disabled={
                                    createPrompt.isPending &&
                                    promptBeingAdded === text
                                }
                                onChange={(e) => setTitle(e.target.value)}
                                className="lb-input mb-2"
                                placeholder={t("Enter a name for the prompt")}
                            />
                        </div>
                        <div>
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                disabled={
                                    createPrompt.isPending &&
                                    promptBeingAdded === text
                                }
                                className="lb-input mb-2"
                                rows={5}
                                type="text"
                                placeholder={t("Enter the prompt")}
                            />
                        </div>
                        <LLMSelector value={llm} onChange={setLLM} />
                        <div>
                            <LoadingButton
                                loading={
                                    createPrompt.isPending &&
                                    promptBeingAdded === text
                                }
                                text={t("Adding") + "..."}
                                className={
                                    "lb-primary py-2 w-24 flex justify-center"
                                }
                                disabled={!title || !text}
                                onClick={async () => {
                                    setPromptBeingAdded(text);
                                    await createPrompt.mutateAsync({
                                        workspaceId: workspace._id,
                                        prompt: {
                                            title,
                                            text,
                                            llm,
                                        },
                                    });
                                    setPromptBeingAdded(null);
                                    setIsOpen(false);
                                }}
                            >
                                {t("Add")}
                            </LoadingButton>
                        </div>
                    </div>
                </div>
            </Tabs>
        </>
    );
}
