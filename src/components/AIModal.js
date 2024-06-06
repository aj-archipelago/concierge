import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import actions from "./editor/AIEditorActions";
// import { Dialog, DialogTitle, DialogContent, DialogHeader, DialogFooter } from "@/components/ui/dialog"
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { X } from "lucide-react";

export default function AIModal({
    show,
    onHide,
    action,
    args,
    inputText,
    onCommit,
}) {
    const [text, setText] = useState(inputText);
    const [result, setResult] = useState("");
    const [inputType, setInputType] = useState("full");
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
                    args={args}
                    onSelect={onSelectCallback}
                />
            ) : null,
        [
            SuggestionsComponent,
            regenerateLabel,
            diffEditorRef,
            text,
            args,
            onSelectCallback,
        ],
    );

    if (!action) {
        return null;
    }

    const close = () => {
        onHide();
        setText("");
    };
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
                                <Dialog.Panel className="w-full max-w-6xl max-h-[calc(100vh-100px)] overflow-auto transform rounded-md bg-white p-6 text-start align-middle shadow-xl transition-all flex flex-col gap-3">
                                    <Dialog.Title
                                        as="h3"
                                        className="text-lg font-medium leading-6 text-gray-900"
                                    >
                                        <div className="justify-between flex">
                                            <div>{t(title)}</div>
                                            <div>
                                                <button
                                                    onClick={close}
                                                    className="p-1 rounded-full hover:bg-gray-100"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </Dialog.Title>
                                    <div className="grow h-[calc(100vh-200px)] overflow-auto">
                                        {modalBody}
                                    </div>
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
                                                disabled={!result}
                                                onClick={() => {
                                                    const value =
                                                        diffEditorRef.current
                                                            ? diffEditorRef.current
                                                                  .getModifiedEditor()
                                                                  .getValue()
                                                            : result;

                                                    if (inputType === "full") {
                                                        onCommit(value, "full");
                                                    } else {
                                                        onCommit(
                                                            value,
                                                            "selection",
                                                        );
                                                    }
                                                    close();
                                                }}
                                            >
                                                {t(commitLabel)}
                                            </button>
                                        )}
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
