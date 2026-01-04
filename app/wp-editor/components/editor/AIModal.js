import { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../../../@/components/ui/dialog";
import i18n from "../../../../src/i18n";
import Button from "./button/index";

export default function AIModal({
    command,
    title,
    SuggestionsComponent,
    commitText,
    cancelText,
    allowSelection = false,
    regenerateText,
    dialogClassName = "",
    requireText = true,
}) {
    const [show, setShow] = useState(false);
    const [text, setText] = useState("");
    const [queryArgs, setQueryArgs] = useState({});
    const [result, setResult] = useState("");
    const diffEditorRef = useRef(null);
    const [editorOperation, setEditorOperation] = useState("replaceText");
    const [portalContainer, setPortalContainer] = useState(null);

    useEffect(() => {
        // Set up portal container for iframe context
        const container = document.getElementById("wp-editor-portal-root");
        if (container) {
            setPortalContainer(container);
        }

        const handleMessage = (message) => {
            const { data } = message;
            const { args, operation } = data;

            if (data.type && data.type === command) {
                setShow(true);

                // Notify parent that modal is opened
                if (window.parent !== window) {
                    window.parent.postMessage(
                        { type: "__MODAL_OPENED__" },
                        "*",
                    );
                }

                if (allowSelection) {
                    if (data.selectedText?.trim()) {
                        setEditorOperation(operation || "replaceSelection");
                    } else {
                        setEditorOperation(operation || "replaceText");
                    }

                    setText(data.selectedText?.trim() || data.text?.trim());
                } else {
                    setText(data.text.trim());
                    setEditorOperation(operation || "replaceText");
                }

                if (args) {
                    setQueryArgs(args);
                }
            }
        };

        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, [command, allowSelection]);

    const close = () => {
        setShow(false);
        setText("");
        setQueryArgs({});
        setResult("");

        // Notify parent that modal is closed
        if (window.parent !== window) {
            window.parent.postMessage({ type: "__MODAL_CLOSED__" }, "*");
        }
    };

    const handleOpenChange = (open) => {
        if (!open) {
            close();
        } else {
            setShow(open);
        }
    };

    return (
        <Dialog open={show} onOpenChange={handleOpenChange}>
            <DialogContent
                className={`max-w-7xl max-h-[90vh] overflow-auto ${dialogClassName}`}
                container={portalContainer}
            >
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="py-4 overflow-auto">
                    {!requireText || text ? (
                        <SuggestionsComponent
                            regenerateText={regenerateText}
                            diffEditorRef={diffEditorRef}
                            text={text}
                            args={queryArgs}
                            onSelect={(h) => {
                                setResult(h);
                            }}
                        />
                    ) : (
                        <div className="modal-content">
                            <p className="error-message">
                                {i18n.t(
                                    "Please add some data to the post content to generate suggestions",
                                )}
                            </p>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <div className="flex gap-2 justify-end">
                        {cancelText && (
                            <Button
                                variant="default"
                                className="cancel"
                                onClick={() => {
                                    close();
                                }}
                            >
                                {cancelText}
                            </Button>
                        )}
                        {commitText && (
                            <Button
                                variant="default"
                                disabled={!result}
                                onClick={() => {
                                    const value = diffEditorRef.current
                                        ? diffEditorRef.current
                                              .getModifiedEditor()
                                              .getValue()
                                        : result;

                                    // Send result to parent (WordPress)
                                    const message = {
                                        type: editorOperation,
                                        result: value,
                                        command,
                                    };

                                    if (window.parent !== window) {
                                        window.parent.postMessage(message, "*");
                                    } else {
                                        window.postMessage(message, "*");
                                    }

                                    close();
                                }}
                            >
                                {commitText}
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
