import { useCallback, useState } from "react";
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
        <div className="flex gap-3">
            <div className="flex-1">
                <div>
                    <TextareaAutosize
                        className="px-1 font-serif placeholder-gray-400 border-0 resize-none focus:ring-sky-400 text-3xl w-full py-0 font-medium"
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
                        className="px-1 font-serif placeholder-gray-400 border-0 resize-none text-xl focus:ring-sky-400 w-full text-gray-600 py-0 font-normal"
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
                        className="flex-1 border rounded"
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

                        <button
                            className="lb-secondary"
                            style={{ marginTop: 10 }}
                            onClick={() => setExpanded(false)}
                        >
                            {t("Create a headline")}
                        </button>
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
        </div>
    );
}

export default HeadlineEditor;
