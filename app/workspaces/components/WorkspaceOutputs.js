import TimeAgo from "javascript-time-ago";
import ar from "javascript-time-ago/locale/ar.json";
import en from "javascript-time-ago/locale/en.json";
import ReactTimeAgo from "react-time-ago";
import CopyButton from "../../../src/components/CopyButton";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";
import { useTranslation } from "react-i18next";

if (typeof document !== "undefined") {
    TimeAgo.addLocale(ar);
    TimeAgo.addLocale(en);
    TimeAgo.setDefaultLocale(
        document.documentElement.lang === "ar" ? ar.locale : en.locale,
    );
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
    const { t } = useTranslation();

    return (
        <div key={output._id} className="relative mb-3">
            <div className="font-medium">{output.title}</div>
            <div className="mt-3 mb-1 p-3 bg-gray-50 border rounded relative text-sm">
                <CopyButton item={output.output} variant="opaque" />
                {convertMessageToMarkdown({ payload: output.output })}
            </div>
            <div className="text-xs text-gray-300 flex justify-between gap-4 px-2">
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
                    className="text-gray-300 hover:text-gray-500"
                >
                    {t("Delete")}
                </button>
            </div>
        </div>
    );
}
