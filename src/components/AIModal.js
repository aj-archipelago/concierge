import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "react-bootstrap/Modal";
import { useTranslation } from "react-i18next";
import actions from "./editor/AIEditorActions";

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
    const {
        title,
        dialogClassName,
        SuggestionsComponent,
        commitLabel,
        regenerateLabel,
    } = options;

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
            <Modal
                dialogClassName={dialogClassName}
                animation={false}
                show={show}
                onHide={close}
            >
                <Modal.Header>
                    <Modal.Title>{t(title)}</Modal.Title>
                </Modal.Header>
                <Modal.Body>{modalBody}</Modal.Body>
                <Modal.Footer>
                    <button className="lb-secondary" onClick={close}>
                        {commitLabel ? t("Cancel") : t("Close")}
                    </button>
                    {commitLabel && (
                        <button
                            className="lb-primary"
                            disabled={!result}
                            onClick={() => {
                                const value = diffEditorRef.current
                                    ? diffEditorRef.current
                                          .getModifiedEditor()
                                          .getValue()
                                    : result;

                                if (inputType === "full") {
                                    onCommit(value, "full");
                                } else {
                                    onCommit(value, "selection");
                                }
                                close();
                            }}
                        >
                            {t(commitLabel)}
                        </button>
                    )}
                </Modal.Footer>
            </Modal>
        </>
    );
}
