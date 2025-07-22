import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Edit, Play } from "lucide-react";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";
import Loader from "../../components/loader";
import { useLLM, useLLMs } from "../../queries/llms";
import { usePromptsByIds } from "../../queries/prompts";
import { WorkspaceContext } from "./WorkspaceContent";

export default function PromptList({
    inputValid,
    promptIds,
    onRun,
    onEdit,
    onNew,
    onRunAll,
    onReorder,
}) {
    const [runningPromptId, setRunningPromptId] = useState(null);
    const [filter, setFilter] = useState("");
    const { isOwner } = useContext(WorkspaceContext);
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [tempPromptIds, setTempPromptIds] = useState(promptIds);
    const { data: prompts } = usePromptsByIds(tempPromptIds);

    useEffect(() => {
        setTempPromptIds(promptIds);
    }, [promptIds]);

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

    const onDragEnd = (result) => {
        if (!result.destination) {
            return;
        }

        const items = Array.from(promptIds);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setTempPromptIds(items);
        onReorder(items);
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
                        className={"lb-success lb-sm flex gap-2 mb-0"}
                    >
                        <span
                            className={direction === "rtl" ? "rotate-180" : ""}
                        >
                            <Play size={9} />
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
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="droppable">
                    {(provided, snapshot) => (
                        <div
                            className="text-sm grow overflow-auto"
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {filteredPrompts.map((prompt, index) => {
                                const isPromptRunning =
                                    runningPromptId === prompt._id;

                                return (
                                    <Draggable
                                        key={prompt._id}
                                        draggableId={prompt._id}
                                        isDragDisabled={!isOwner}
                                        index={index}
                                    >
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                                style={
                                                    provided.draggableProps
                                                        .style
                                                }
                                            >
                                                <PromptListItem
                                                    key={prompt._id}
                                                    prompt={prompt}
                                                    isRunning={isPromptRunning}
                                                    onEdit={onEdit}
                                                    onRun={() =>
                                                        onPromptRun(prompt)
                                                    }
                                                    inputValid={inputValid}
                                                />
                                            </div>
                                        )}
                                    </Draggable>
                                );
                            })}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
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
        <div key={prompt._id} className="mb-2 relative">
            <div className="w-full text-start bg-gray-50 dark:bg-gray-800 rounded-md border dark:border-gray-600 flex">
                <div className="p-2 relative border-e border-gray-300 overflow-auto basis-[calc(100%-5em)]">
                    <div className="flex gap-2 items-center justify-between mb-1">
                        <div className="font-medium">
                            {prompt.title}
                            {llm && (
                                <div>
                                    <span className="block sm:hidden items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                                        {llm?.name}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {llm && (
                                <span className="hidden sm:inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                                    {llm?.name}
                                </span>
                            )}
                            {!isRunning && isOwner && (
                                <button
                                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 active:text-gray-900 dark:active:text-gray-200 cursor-pointer"
                                    onClick={(e) => {
                                        onEdit(prompt);
                                        e.stopPropagation();
                                        e.preventDefault();
                                    }}
                                    title={t("Edit prompt")}
                                >
                                    <Edit />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="text-gray-500 dark:text-gray-400 text-xs">
                        {prompt.text}
                    </div>
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
                                <Play size={9} />
                            </span>
                            {t("Run")}
                        </div>
                    )}
                </button>
            </div>
        </div>
    );
}
