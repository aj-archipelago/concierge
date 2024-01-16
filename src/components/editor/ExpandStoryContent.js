import { useState } from "react";
import { ListGroup } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import CopyButton from "../CopyButton";
import { getTextSuggestionsComponent } from "./TextSuggestions";

export default getTextSuggestionsComponent({
    query: "EXPAND_STORY",
    outputTitle: "What else would the reader like to know?",
    OutputRenderer: ({ value }) => {
        const [answers] = useState({});
        const { t } = useTranslation();

        return (
            <ListGroup style={{ marginBottom: 20 }}>
                {value.map((question) => {
                    return (
                        <ListGroup.Item>
                            <div className="absolute end-5 top-0">
                                <CopyButton
                                    item={`${question}\n${answers[question] || ""}`}
                                />
                            </div>
                            <h6>{question}</h6>
                            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
                            <p>
                                {!answers[question] && (
                                    <>
                                        <a
                                            className="text-sky-500 hover:text-sky-300 active:text-sky-700 hover:underline text-xs"
                                            rel="noreferrer"
                                            target="_blank"
                                            href={`https://www.bing.com/search?q=${question}`}
                                        >
                                            {t("Ask Bing")}
                                        </a>
                                    </>
                                )}
                            </p>
                            {answers[question] && (
                                <div>
                                    <p>{answers[question]}</p>
                                </div>
                            )}
                        </ListGroup.Item>
                    );
                })}
            </ListGroup>
        );
    },
});
