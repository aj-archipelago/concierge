import TimeAgo from "javascript-time-ago";
import ar from "javascript-time-ago/locale/ar.json";
import en from "javascript-time-ago/locale/en.json";
import ReactTimeAgo from "react-time-ago";
import CopyButton from "../../../src/components/CopyButton";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";

if (typeof document !== "undefined") {
    TimeAgo.addDefaultLocale(document.documentElement.lang === "ar" ? ar : en);
}

export default function WorkspaceOutputs({ outputs = [], onDelete }) {
    return (
        <div className="flex flex-col gap-2 h-[calc(100vh-260px)] overflow-auto">
            {outputs.map((output) => (
                <Output output={output} key={output._id} onDelete={onDelete} />
            ))}
        </div>
    );
}

function Output({ output, onDelete }) {
    return (
        <div key={output._id} className="relative mb-3">
            <div className="font-medium">{output.title}</div>
            <div className="mt-3 mb-1 p-3 bg-gray-50 border rounded relative text-sm">
                <CopyButton item={output.text} variant="opaque" />
                {convertMessageToMarkdown({ payload: output.text })}
            </div>
            <div className="text-xs text-gray-300 flex justify-between gap-4 px-2">
                <div>
                    Generated <ReactTimeAgo date={output.createdAt} />
                </div>
                <button
                    onClick={() => {
                        if (
                            confirm(
                                "Are you sure you want to delete this output?",
                            )
                        ) {
                            onDelete(output._id);
                        }
                    }}
                    className="text-gray-300 hover:text-gray-500"
                >
                    Delete
                </button>
            </div>
        </div>
    );
}
