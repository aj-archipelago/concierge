import { useState } from "react";
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
            <div className="h-full w-full overflow-y-auto border rounded-md">
                <ul className="p-2 mb-5">
                    {value.map((question, index) => {
                        return (
                            <li key={index} className="relative mb-4 last:mb-0">
                                <div className="absolute right-2 top-0">
                                    <CopyButton
                                        item={`${question}\n${answers[question] || ""}`}
                                    />
                                </div>
                                <h6 className="font-bold mb-2">{question}</h6>
                                <p>
                                    {!answers[question] && (
                                        <a
                                            className="text-sky-500 hover:text-sky-300 active:text-sky-700 hover:underline text-xs"
                                            rel="noreferrer"
                                            target="_blank"
                                            href={`https://www.bing.com/search?q=${encodeURIComponent(question)}`}
                                        >
                                            {t("Ask Bing")}
                                        </a>
                                    )}
                                </p>
                                {answers[question] && (
                                    <div>
                                        <p>{answers[question]}</p>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    },
});
