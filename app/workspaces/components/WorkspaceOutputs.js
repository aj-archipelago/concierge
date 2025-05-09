import { useTranslation } from "react-i18next";
import ReactTimeAgo from "react-time-ago";
import CopyButton from "../../../src/components/CopyButton";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";
import OutputSandbox from "../../../src/components/sandbox/OutputSandbox";

export default function WorkspaceOutputs({ outputs = [], onDelete }) {
    return (
        <div className="flex flex-col gap-4">
            {outputs.map((output) => (
                <Output output={output} key={output._id} onDelete={onDelete} />
            ))}
        </div>
    );
}

function Output({ output, onDelete }) {
    const { t } = useTranslation();

    // Check if the output is HTML content
    const isHtmlContent =
        output.output.trim().startsWith("<!DOCTYPE html>") ||
        output.output.trim().startsWith("<html>") ||
        (output.tool && JSON.parse(output.tool)?.isHtml);

    return (
        <div key={output._id} className="relative mb-3">
            <div className="font-semibold text-lg">{output.title}</div>
            <div className="mt-3 mb-1 p-4 bg-gray-50 border rounded-md relative">
                <div className="absolute top-3 right-3">
                    <CopyButton
                        item={output.output}
                        className="opacity-60 hover:opacity-100"
                    />
                </div>
                {isHtmlContent ? (
                    <OutputSandbox content={output.output} />
                ) : (
                    <div className="chat-message-bot">
                        {convertMessageToMarkdown({
                            payload: output.output,
                            tool: output.citations
                                ? JSON.stringify({
                                      citations: output.citations,
                                  })
                                : null,
                        })}
                    </div>
                )}
                <div className="text-xs text-gray-400 flex justify-between gap-4 mt-4">
                    <div>
                        {t("Generated")}{" "}
                        <ReactTimeAgo date={new Date(output.createdAt)} />
                    </div>
                    <button
                        onClick={() => {
                            if (
                                window.confirm(
                                    t(
                                        "Are you sure you want to delete this output?",
                                    ),
                                )
                            ) {
                                onDelete(output._id);
                            }
                        }}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        {t("Delete")}
                    </button>
                </div>
            </div>
        </div>
    );
}
