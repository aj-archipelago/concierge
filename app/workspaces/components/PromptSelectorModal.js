import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useContext, useState } from "react";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import {
    useCreatePrompt,
    usePromptLibrary,
    usePromptsByIds,
} from "../../queries/prompts";
import { WorkspaceContext } from "./WorkspaceContent";
import { useLLMs } from "../../queries/llms";
import { useTranslation } from "react-i18next";

export default function PromptSelectorModal({ isOpen, setIsOpen }) {
    const { t } = useTranslation();

    return (
        <>
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog
                    as="div"
                    className="relative z-50"
                    onClose={() => {
                        setIsOpen(false);
                    }}
                >
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/25" />
                    </Transition.Child>

                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4 text-center">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <Dialog.Panel className="w-full max-w-6xl h-[500px] transform overflow-hidden rounded-2xl bg-gray-50 p-6 text-start align-middle shadow-xl transition-all">
                                    <div className="flex flex-col gap-2 h-full">
                                        <Dialog.Title
                                            as="h3"
                                            className="text-lg font-medium leading-6 text-gray-900 mb-3"
                                        >
                                            {t(
                                                "Add a prompt to your workspace",
                                            )}
                                        </Dialog.Title>
                                        <SelectorDialog setIsOpen={setIsOpen} />

                                        <div className="mt-4 flex justify-end">
                                            <button
                                                type="button"
                                                className="lb-primary w-40 flex justify-center py-2"
                                                onClick={() => {
                                                    setIsOpen(false);
                                                }}
                                            >
                                                {t("Done")}
                                            </button>
                                        </div>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </>
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
    const { data: llms } = useLLMs();
    const [addedLast, setAddedLast] = useState(null);
    const { t } = useTranslation();

    return (
        <>
            <div className="flex gap-4 grow overflow-auto p-1 ">
                <div className="basis-6/12">
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
                    <select
                        value={llm}
                        onChange={(e) => setLLM(e.target.value)}
                        className="lb-input mb-2"
                    >
                        {llms?.map((llm) => (
                            <option key={llm._id} value={llm._id}>
                                {llm.name}
                            </option>
                        ))}
                    </select>
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
                <div className="basis-6/12 flex flex-col gap-3 h-full">
                    <h4>{t("Or add prompts from the AJ prompt library")}</h4>
                    <div className="h-full overflow-auto flex flex-col gap-3">
                        {promptLibrary?.map((prompt, index) => {
                            const promptWithSameTitleExists =
                                workspacePrompts?.some(
                                    (p) => p?.title === prompt.title,
                                ) || addedLast === prompt.title;

                            return (
                                <div
                                    key={index}
                                    className="w-full flex items-center justify-between"
                                >
                                    <div className="bg-gray-100 p-4 rounded grow border">
                                        <h3 className="text-sm font-medium">
                                            {prompt.title}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            {prompt.text}
                                        </p>
                                        {promptWithSameTitleExists ? (
                                            <span className="text-sm text-gray-400">
                                                {t("Added")}
                                            </span>
                                        ) : (
                                            <LoadingButton
                                                loading={
                                                    createPrompt.isPending &&
                                                    promptBeingAdded ===
                                                        prompt.text
                                                }
                                                text={t("Adding") + "..."}
                                                className="text-sm text-blue-500 hover:text-blue-700"
                                                onClick={async () => {
                                                    setPromptBeingAdded(
                                                        prompt?.text,
                                                    );
                                                    await createPrompt.mutateAsync(
                                                        {
                                                            workspaceId:
                                                                workspace._id,
                                                            prompt: prompt,
                                                        },
                                                    );
                                                    setPromptBeingAdded(null);
                                                    setAddedLast(prompt.title);
                                                }}
                                            >
                                                {t("Add")}
                                            </LoadingButton>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
}
