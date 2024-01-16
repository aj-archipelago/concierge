import { useCallback, useState } from "react";
import { Button, FormGroup } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { AiOutlineMinusCircle, AiOutlinePlusCircle } from "react-icons/ai";
import TextareaAutosize from "react-textarea-autosize";
import AIModal from "../../AIModal";

function HeadlineEditor({ articleText, headline, subhead, onChange }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);

    const onHideCallback = useCallback(() => setExpanded(false), [setExpanded]);
    const onCommitCallback = useCallback((t) => onChange(t), [onChange]);

    return (
        <FormGroup className="d-flex gap-3">
            <div className="flex-grow-1">
                <div>
                    <TextareaAutosize
                        className="headline-input w-100"
                        placeholder={t("Headline")}
                        value={headline}
                        onChange={(e) =>
                            onChange({
                                headline: e.target.value,
                                subhead,
                            })
                        }
                    />
                </div>

                <div>
                    <TextareaAutosize
                        className="subhead-input w-100"
                        placeholder={t("Subhead")}
                        value={subhead}
                        onChange={(e) =>
                            onChange({
                                headline,
                                subhead: e.target.value,
                            })
                        }
                    />
                </div>
            </div>

            {expanded && (
                <>
                    <AIModal
                        show={expanded}
                        onHide={onHideCallback}
                        action={"headline"}
                        args={null}
                        inputText={articleText}
                        onCommit={onCommitCallback}
                    />
                    <div
                        className="flex-grow-1 border rounded"
                        style={{ padding: 20, backgroundColor: "#eee" }}
                    >
                        <p>What's the main point of the story?</p>
                        <TextareaAutosize
                            placeholder={
                                "e.g. the stock market fell by 500 points today."
                            }
                            style={{ width: "100%", border: 0 }}
                            value={headline}
                            className="form-control"
                            onChange={(e) => onChange(e.target.value)}
                        />
                        <br />
                        <p>
                            What are some keywords that the headline must
                            include?
                        </p>
                        <TextareaAutosize
                            placeholder={"e.g. stocks, recession"}
                            style={{ width: "100%", border: 0 }}
                            value={headline}
                            className="form-control"
                            onChange={(e) => onChange(e.target.value)}
                        />

                        <Button
                            variant="secondary"
                            style={{ marginTop: 10 }}
                            onClick={() => setExpanded(false)}
                        >
                            {t("Create a headline")}
                        </Button>
                    </div>
                </>
            )}

            {true && (
                <button
                    className="refresh-button"
                    disabled={!articleText}
                    onClick={async () => {
                        setExpanded(!expanded);
                    }}
                    style={{ cursor: "pointer" }}
                >
                    {!expanded && <AiOutlinePlusCircle />}
                    {expanded && <AiOutlineMinusCircle />}
                </button>
            )}
        </FormGroup>
    );
}

export default HeadlineEditor;
