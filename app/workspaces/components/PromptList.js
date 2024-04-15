import { useContext, useState } from "react";
import { FaEdit, FaPlay } from "react-icons/fa";
import stringcase from "stringcase";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import Loader from "../../components/loader";
import { WorkspaceContext } from "./WorkspaceContent";
import { useLLM, useLLMs } from "../../queries/llms";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";

export default function PromptList({
    inputValid,
    prompts,
    onRun,
    onEdit,
    onNew,
    onRunAll,
}) {
    const [runningPromptId, setRunningPromptId] = useState(null);
    const [filter, setFilter] = useState("");
    const { isOwner } = useContext(WorkspaceContext);
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);

    const filteredPrompts = prompts?.filter((prompt) =>
        prompt?.title.toLowerCase().includes(filter.toLowerCase()),
    );

    if (!prompts?.length && isOwner) {
        return (
            <div className="text-center mt-4">
                <button className="lb-outline-secondary" onClick={onNew}>
                    {t("Add prompts to this workspace")}
                </button>
            </div>
        );
    }

    const onPromptRun = async (prompt) => {
        setRunningPromptId(prompt._id);
        await onRun(prompt);
        setRunningPromptId(null);
    };
    return (
        <div className="flex flex-col grow overflow-auto p-1">
            <div className="flex justify-between items-center mb-3">
                <h4 className=" font-medium">{t("Prompts")}</h4>
                <div className="flex gap-2">
                    {isOwner && (
                        <button
                            className="lb-outline-secondary lb-sm"
                            onClick={onNew}
                        >
                            + {t("Add Prompt")}
                        </button>
                    )}
                    <LoadingButton
                        loading={runningPromptId === "all"}
                        text="Running"
                        disabled={!inputValid || runningPromptId}
                        onClick={async () => {
                            setRunningPromptId("all");
                            await onRunAll();
                            setRunningPromptId(null);
                        }}
                        className={"lb-success lb-sm flex gap-2"}
                    >
                        <span
                            className={direction === "rtl" ? "rotate-180" : ""}
                        >
                            <FaPlay size={9} />
                        </span>
                        {t("Run all")}
                    </LoadingButton>
                </div>
            </div>
            <input
                type="text"
                placeholder={t("Search prompts")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="lb-input text-sm mb-3"
            />
            <ul className="text-sm grow overflow-auto">
                {filteredPrompts.map((prompt) => {
                    const isPromptRunning = runningPromptId === prompt._id;

                    return (
                        <PromptListItem
                            key={prompt._id}
                            prompt={prompt}
                            isRunning={isPromptRunning}
                            onEdit={onEdit}
                            onRun={() => onPromptRun(prompt)}
                            inputValid={inputValid}
                        />
                    );
                })}
            </ul>
        </div>
    );
}

function PromptListItem({ prompt, onEdit, onRun, isRunning, inputValid }) {
    const { isOwner } = useContext(WorkspaceContext);
    let { data: llm } = useLLM(prompt?.llm);
    const { data: llms } = useLLMs();
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);

    if (!prompt.llm) {
        llm = llms?.find((llm) => llm.isDefault);
    }

    return (
        <li key={prompt._id} className="mb-2 relative">
            <div className="w-full text-start bg-gray-50 rounded border flex">
                <div className="p-2 relative border-e border-gray-300 overflow-auto basis-[calc(100%-5em)]">
                    <div className="flex gap-2 items-center justify-between mb-1">
                        <div className="font-medium">{prompt.title}</div>
                        <div className="flex items-center gap-2">
                            {llm && (
                                <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                                    {llm.name}
                                </span>
                            )}
                            {!isRunning && isOwner && (
                                <button
                                    className="text-gray-500 hover:text-gray-700 active:text-gray-900 cursor-pointer"
                                    onClick={(e) => {
                                        onEdit(prompt);
                                        e.stopPropagation();
                                        e.preventDefault();
                                    }}
                                    title={t("Edit prompt")}
                                >
                                    <FaEdit />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="text-gray-500 text-xs">{prompt.text}</div>
                </div>
                <button
                    className="disabled:opacity-50 enabled:hover:bg-gray-100 enabled:active:bg-gray-200 p-2 basis-[5em] slef-stretch flex items-center justify-center"
                    disabled={isRunning || !inputValid}
                    onClick={onRun}
                >
                    {isRunning && <Loader />}
                    {!isRunning && (
                        <div className="flex gap-1.5 items-center">
                            <span
                                className={
                                    direction === "rtl" ? "rotate-180" : ""
                                }
                            >
                                <FaPlay size={9} />
                            </span>
                            {t("Run")}
                        </div>
                    )}
                </button>
            </div>
        </li>
    );
}
