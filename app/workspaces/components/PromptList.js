import { useState } from "react";
import { FaEdit } from "react-icons/fa";
import stringcase from "stringcase";
import Loader from "../../components/loader";

export default function PromptList({ prompts, onSelect, onEdit, onNew }) {
    const [runningPromptId, setRunningPromptId] = useState(null);
    const [filter, setFilter] = useState("");

    const filteredPrompts = prompts?.filter((prompt) =>
        prompt?.title.toLowerCase().includes(filter.toLowerCase()),
    );

    return (
        <div className="flex flex-col grow overflow-auto p-1">
            <div className="flex justify-between items-center mb-3">
                <h4 className="text-lg font-medium">Prompts</h4>
                <button className="lb-outline-secondary lb-sm" onClick={onNew}>
                    + Add prompt
                </button>
            </div>
            <input
                type="text"
                placeholder="Search prompts"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="lb-input mb-3"
            />
            <ul className="text-sm grow overflow-auto">
                {filteredPrompts.map((prompt) => (
                    <li key={prompt._id} className="mb-2">
                        <button
                            className="w-full text-left bg-gray-50 hover:bg-gray-100 active:bg-gray-200 p-2 rounded border"
                            disabled={runningPromptId === prompt._id}
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
                                {runningPromptId !== prompt._id && (
                                    <div
                                        className="text-gray-500 hover:text-gray-700 active:text-gray-900 cursor-pointer"
                                        onClick={(e) => {
                                            onEdit(prompt);
                                            e.stopPropagation();
                                            e.preventDefault();
                                        }}
                                        title="Edit prompt before running"
                                    >
                                        <FaEdit />
                                    </div>
                                )}
                                {runningPromptId === prompt._id && <Loader />}
                            </div>

                            <div className="text-gray-500 text-xs">
                                {prompt.text}
                            </div>
                        </button>
                    </li>
                ))}
                {!prompts?.length && "No prompts saved"}
            </ul>
        </div>
    );
}
