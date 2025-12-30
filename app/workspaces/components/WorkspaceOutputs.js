import { useTranslation } from "react-i18next";
import { useContext, useState } from "react";
import i18next from "i18next";
import ReactTimeAgo from "react-time-ago";
import CopyButton from "../../../src/components/CopyButton";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";
import OutputSandbox from "../../../src/components/sandbox/OutputSandbox";
import { ThemeContext } from "../../../src/contexts/ThemeProvider";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../../../@/components/ui/alert-dialog";

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
    const { theme } = useContext(ThemeContext);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const isRtl = i18next.language === "ar";

    // Check if the output is HTML content
    const isHtmlContent =
        output.output?.trim().startsWith("<!DOCTYPE html>") ||
        output.output?.trim().startsWith("<html>") ||
        (output.tool && JSON.parse(output.tool)?.isHtml);

    return (
        <div key={output._id} className="relative mb-3">
            <div
                className={`font-semibold text-lg ${isRtl ? "text-right" : ""}`}
            >
                {output.title}
            </div>
            <div className="mt-3 mb-1 p-3 sm:p-4 bg-gray-50 dark:bg-gray-800 border dark:border-gray-600 rounded-md relative">
                <div
                    className={`absolute top-3 ${isRtl ? "left-3" : "right-3"}`}
                >
                    <CopyButton
                        item={output.output}
                        className="opacity-60 hover:opacity-100"
                    />
                </div>
                {isHtmlContent ? (
                    <OutputSandbox content={output.output} theme={theme} />
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
                <div
                    className={`text-xs text-gray-400 flex justify-between gap-2 sm:gap-4 mt-4 ${
                        isRtl ? "flex-row-reverse" : ""
                    }`}
                >
                    <div className="truncate flex-shrink">
                        {t("Generated")}{" "}
                        <ReactTimeAgo date={new Date(output.createdAt)} />
                    </div>
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                        {t("Delete")}
                    </button>
                </div>
            </div>

            <AlertDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader className={isRtl ? "text-right" : ""}>
                        <AlertDialogTitle>
                            {t("Delete Output")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete this output? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter
                        className={
                            isRtl ? "flex-row-reverse sm:flex-row-reverse" : ""
                        }
                    >
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                onDelete(output._id);
                                setShowDeleteConfirm(false);
                            }}
                        >
                            {t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
