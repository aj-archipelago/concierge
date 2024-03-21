import { useState } from "react";
import { FaEdit, FaPlay } from "react-icons/fa";
import stringcase from "stringcase";
import Loader from "../../components/loader";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import PromptSelectorModal from "./PromptSelectorModal";

export default function PromptList({
    inputValid,
    prompts,
    onSelect,
    onEdit,
    onNew,
    onRunAll,
}) {
    const [runningPromptId, setRunningPromptId] = useState(null);
    const [filter, setFilter] = useState("");

    const filteredPrompts = prompts?.filter((prompt) =>
        prompt?.title.toLowerCase().includes(filter.toLowerCase()),
    );

    if (!prompts?.length) {
        return (
            <div>
                <p className="text-center">
                    <button className="lb-outline-secondary" onClick={onNew}>
                        Add prompts to this workspace
                    </button>
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col grow overflow-auto p-1">
            <div className="flex justify-between items-center mb-3">
                <h4 className=" font-medium">Prompts</h4>
                <div className="flex gap-2">
                    <button
                        className="lb-outline-secondary lb-sm"
                        onClick={onNew}
                    >
                        + Add prompt
                    </button>
                    <LoadingButton
                        loading={runningPromptId}
                        text="Running"
                        disabled={!inputValid}
                        onClick={async () => {
                            setRunningPromptId("all");
                            await onRunAll();
                            setRunningPromptId(null);
                        }}
                        className="lb-success lb-sm flex gap-2"
                    >
                        <FaPlay size={9} /> Run all
                    </LoadingButton>
                </div>
            </div>
            <input
                type="text"
                placeholder="Search prompts"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="lb-input text-sm mb-3"
            />
            <ul className="text-sm grow overflow-auto">
                {filteredPrompts.map((prompt) => (
                    <li key={prompt._id} className="mb-2 relative">
                        {runningPromptId !== prompt._id && (
                            <button
                                className="top-2 end-2 absolute text-gray-500 hover:text-gray-700 active:text-gray-900 cursor-pointer"
                                onClick={(e) => {
                                    onEdit(prompt);
                                    e.stopPropagation();
                                    e.preventDefault();
                                }}
                                title="Edit prompt"
                            >
                                <FaEdit />
                            </button>
                        )}
                        <button
                            className="w-full text-left bg-gray-50 enabled:hover:bg-gray-100 enabled:active:bg-gray-200 p-2 rounded border"
                            disabled={
                                runningPromptId === prompt._id || !inputValid
                            }
                            onClick={async () => {
                                setRunningPromptId(prompt._id);
                                await onSelect(prompt);
                                setRunningPromptId(null);
                            }}
                        >
                            <div className="flex gap-2 items-center justify-between">
                                <div className="font-medium">
                                    {stringcase.titlecase(prompt.title)}
                                </div>
                                {runningPromptId === prompt._id && <Loader />}
                            </div>

                            <div className="text-gray-500 text-xs">
                                {prompt.text}
                            </div>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
