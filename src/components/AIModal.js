import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import actions from "./editor/AIEditorActions";
// import { Dialog, DialogTitle, DialogContent, DialogHeader, DialogFooter } from "@/components/ui/dialog"
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { X } from "lucide-react";
import { extractWidgets, restoreWidgets } from "../utils/widgetUtils";

export default function AIModal({
    show,
    onHide,
    action,
    args,
    inputText,
    inputHtml, // Optional: original HTML content (for styleguide action)
    onCommit,
}) {
    const [text, setText] = useState(inputText);
    const [result, setResult] = useState("");
    const [inputType, setInputType] = useState("full");
    const [isApplyingHtml, setIsApplyingHtml] = useState(false);
    const diffEditorRef = useRef(null);
    const { t } = useTranslation();

    useEffect(() => {
        if (show) {
            setText(inputText);
        }
    }, [inputText, show]);

    useEffect(() => {
        if (!show) {
            setText();
            setResult();
            setInputType("full");
        }
    }, [show]);

    const close = useCallback(() => {
        onHide();
        setText("");
    }, [onHide]);

    const onSelectCallback = useCallback((h) => setResult(h), [setResult]);

    const options = actions[action] || {};
    const { title, SuggestionsComponent, commitLabel, regenerateLabel } =
        options;

    const modalBody = useMemo(
        () =>
            SuggestionsComponent ? (
                <SuggestionsComponent
                    regenerateLabel={regenerateLabel}
                    diffEditorRef={diffEditorRef}
                    text={text}
                    html={
                        action === "styleguide" ||
                        action === "grammar" ||
                        action === "legacy_styleguide"
                            ? inputHtml
                            : undefined
                    } // Pass HTML for styleguide, grammar, and legacy_styleguide actions
                    args={args}
                    onSelect={onSelectCallback}
                    onClose={
                        action === "styleguide" || action === "grammar"
                            ? close
                            : undefined
                    }
                    onCommit={
                        action === "styleguide" || action === "grammar"
                            ? onCommit
                            : undefined
                    }
                />
            ) : null,
        [
            SuggestionsComponent,
            regenerateLabel,
            diffEditorRef,
            text,
            inputHtml,
            args,
            onSelectCallback,
            action,
            close,
            onCommit,
        ],
    );

    if (!action) {
        return null;
    }
    return (
        <>
            <Transition appear show={show} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => {}}>
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
                                <Dialog.Panel className="w-full max-w-6xl max-h-[calc(100vh-100px)] overflow-auto transform rounded-md bg-white p-6 text-start align-middle shadow-xl dark:bg-gray-800 border dark:border-gray-600 transition-all flex flex-col gap-3">
                                    <Dialog.Title
                                        as="h3"
                                        className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100"
                                    >
                                        <div className="justify-between flex">
                                            <div>{t(title)}</div>
                                            <div>
                                                <button
                                                    onClick={close}
                                                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </Dialog.Title>
                                    <div className="grow h-[calc(100vh-200px)] overflow-auto">
                                        {modalBody}
                                    </div>
                                    {action !== "styleguide" &&
                                        action !== "grammar" && (
                                            <div className="justify-end flex gap-2 mt-4">
                                                <button
                                                    className="lb-secondary"
                                                    onClick={close}
                                                >
                                                    {commitLabel
                                                        ? t("Cancel")
                                                        : t("Close")}
                                                </button>
                                                {commitLabel && (
                                                    <button
                                                        className="lb-primary"
                                                        disabled={
                                                            !result ||
                                                            isApplyingHtml
                                                        }
                                                        onClick={async () => {
                                                            const value =
                                                                diffEditorRef.current
                                                                    ? diffEditorRef.current
                                                                          .getModifiedEditor()
                                                                          .getValue()
                                                                    : result;

                                                            // For legacy_styleguide, apply HTML corrections if HTML is available
                                                            if (
                                                                action ===
                                                                    "legacy_styleguide" &&
                                                                inputHtml &&
                                                                inputHtml.trim()
                                                                    .length > 0
                                                            ) {
                                                                setIsApplyingHtml(
                                                                    true,
                                                                );
                                                                try {
                                                                    // Extract widgets before sending to API
                                                                    const {
                                                                        html: htmlWithoutWidgets,
                                                                        widgets,
                                                                    } =
                                                                        extractWidgets(
                                                                            inputHtml,
                                                                        );

                                                                    // Call the HTML corrections endpoint
                                                                    const response =
                                                                        await fetch(
                                                                            "/api/apply-corrections-to-html",
                                                                            {
                                                                                method: "POST",
                                                                                headers:
                                                                                    {
                                                                                        "Content-Type":
                                                                                            "application/json",
                                                                                    },
                                                                                body: JSON.stringify(
                                                                                    {
                                                                                        html: htmlWithoutWidgets,
                                                                                        correctedText:
                                                                                            value,
                                                                                    },
                                                                                ),
                                                                            },
                                                                        );

                                                                    if (
                                                                        !response.ok
                                                                    ) {
                                                                        const errorData =
                                                                            await response
                                                                                .json()
                                                                                .catch(
                                                                                    () => ({}),
                                                                                );
                                                                        throw new Error(
                                                                            errorData.message ||
                                                                                `HTTP error! status: ${response.status}`,
                                                                        );
                                                                    }

                                                                    const result =
                                                                        await response.json();

                                                                    if (
                                                                        !result.correctedHtml
                                                                    ) {
                                                                        throw new Error(
                                                                            "No corrected HTML returned from server.",
                                                                        );
                                                                    }

                                                                    // Restore widgets in the corrected HTML
                                                                    const correctedHtmlWithWidgets =
                                                                        restoreWidgets(
                                                                            result.correctedHtml,
                                                                            widgets,
                                                                        );

                                                                    // Commit the corrected HTML
                                                                    if (
                                                                        inputType ===
                                                                        "full"
                                                                    ) {
                                                                        onCommit(
                                                                            correctedHtmlWithWidgets,
                                                                            "full",
                                                                        );
                                                                    } else {
                                                                        onCommit(
                                                                            correctedHtmlWithWidgets,
                                                                            "selection",
                                                                        );
                                                                    }
                                                                } catch (error) {
                                                                    console.error(
                                                                        "Failed to apply corrections to HTML:",
                                                                        error,
                                                                    );
                                                                    alert(
                                                                        error.message ||
                                                                            t(
                                                                                "Failed to apply corrections to HTML. Please try again.",
                                                                            ),
                                                                    );
                                                                    setIsApplyingHtml(
                                                                        false,
                                                                    );
                                                                    return;
                                                                } finally {
                                                                    setIsApplyingHtml(
                                                                        false,
                                                                    );
                                                                }
                                                            } else {
                                                                // Normal commit without HTML conversion
                                                                if (
                                                                    inputType ===
                                                                    "full"
                                                                ) {
                                                                    onCommit(
                                                                        value,
                                                                        "full",
                                                                    );
                                                                } else {
                                                                    onCommit(
                                                                        value,
                                                                        "selection",
                                                                    );
                                                                }
                                                            }
                                                            close();
                                                        }}
                                                    >
                                                        {isApplyingHtml
                                                            ? t("Applying...")
                                                            : t(commitLabel)}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </>
    );
}
