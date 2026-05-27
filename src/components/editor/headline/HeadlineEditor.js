import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MinusCircle, PlusCircle } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import AIModal from "../../AIModal";

function HeadlineEditor({ articleText, headline, subhead, onChange }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);

    const onHideCallback = useCallback(() => setExpanded(false), [setExpanded]);
    const onCommitCallback = useCallback((t) => onChange(t), [onChange]);

    return (
        <div className="relative">
            <div className={expanded ? "flex gap-3" : ""}>
                <div className={expanded ? "flex-1" : "pe-10"}>
                    <div className="mb-3">
                        <TextareaAutosize
                            className="placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none text-4xl w-full bg-transparent text-gray-900 dark:text-gray-100 transition-colors duration-200 border-0 p-0 m-0"
                            style={{
                                fontFamily: "Roboto, sans-serif",
                                fontWeight: "700",
                                border: "none",
                                padding: 0,
                                margin: 0,
                                outline: "none",
                                boxShadow: "none",
                                // Beat the global dark.scss rule that paints
                                // every textarea with bg-color-dark-dim.
                                backgroundColor: "transparent",
                            }}
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
                            className="placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none text-xl w-full bg-transparent text-gray-500 dark:text-gray-300 transition-colors duration-200 border-0 p-0 m-0"
                            style={{
                                fontFamily: "Georgia, serif",
                                fontStyle: "italic",
                                border: "none",
                                padding: 0,
                                margin: 0,
                                outline: "none",
                                boxShadow: "none",
                                // Beat the global dark.scss textarea bg rule.
                                backgroundColor: "transparent",
                            }}
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
                        <div className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 p-5">
                            <p className="text-gray-700 dark:text-gray-300 mb-2">
                                What's the main point of the story?
                            </p>
                            <TextareaAutosize
                                placeholder={
                                    "e.g. the stock market fell by 500 points today."
                                }
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-sky-400 focus:border-sky-400 dark:focus:ring-sky-500 dark:focus:border-sky-500 resize-none text-base md:text-sm"
                                value={headline}
                                onChange={(e) => onChange(e.target.value)}
                            />
                            <br />
                            <p className="text-gray-700 dark:text-gray-300 mb-2">
                                What are some keywords that the headline must
                                include?
                            </p>
                            <TextareaAutosize
                                placeholder={"e.g. stocks, recession"}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-sky-400 focus:border-sky-400 dark:focus:ring-sky-500 dark:focus:border-sky-500 resize-none text-base md:text-sm"
                                value={headline}
                                onChange={(e) => onChange(e.target.value)}
                            />

                            <button
                                className="mt-3 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-md transition-colors duration-200"
                                onClick={() => setExpanded(false)}
                            >
                                {t("Create a headline")}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {true && (
                <button
                    className="absolute top-0 end-0 refresh-button p-2 text-gray-500 dark:text-gray-400 hover:text-sky-500 dark:hover:text-sky-400 transition-colors duration-200 bg-white dark:bg-gray-800 rounded-md shadow-sm hover:shadow-md z-10"
                    disabled={!articleText}
                    onClick={async () => {
                        setExpanded(!expanded);
                    }}
                    style={{ cursor: "pointer" }}
                >
                    {!expanded && <PlusCircle className="w-5 h-5" />}
                    {expanded && <MinusCircle className="w-5 h-5" />}
                </button>
            )}
        </div>
    );
}

export default HeadlineEditor;
