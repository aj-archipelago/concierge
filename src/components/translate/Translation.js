import { useApolloClient } from "@apollo/client";
import { useRouter } from "next/navigation";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { QUERIES } from "../../graphql";
import { stripHTML } from "../../utils/html.utils";
import CopyButton from "../CopyButton";
import LoadingButton from "../editor/LoadingButton";
import classNames from "../../../app/utils/class-names";
import { XIcon } from "lucide-react";

const LANGUAGE_NAMES = {
    en: "English",
    ar: "Arabic",
    es: "Spanish",
    fr: "French",
    bs: "Bosnian",
    hr: "Croatian",
    zh: "Chinese",
    de: "German",
    it: "Italian",
    ja: "Japanese",
    ko: "Korean",
    pt: "Portuguese",
    ru: "Russian",
    sr: "Serbian",
    tr: "Turkish",
};

function Translation({
    inputText,
    translationStrategy,
    translationLanguage,
    translatedText,
    setTranslatedText,
    setTranslationInputText,
    setTranslationLanguage,
    setTranslationStrategy,
    setWriteInputText,
    showEditLink = false,
}) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const apolloClient = useApolloClient();
    const { language } = useContext(LanguageContext);

    const executeTranslation = (strategy, inputText, to) => {
        let query;
        let resultKey;

        switch (strategy) {
            case "GPT-4":
                query = QUERIES.TRANSLATE_GPT4;
                resultKey = "translate_gpt4";
                to = LANGUAGE_NAMES[to];
                break;
            case "GPT-4-OMNI":
                query = QUERIES.TRANSLATE_GPT4_OMNI;
                resultKey = "translate_gpt4_omni";
                to = LANGUAGE_NAMES[to];
                break;
            case "traditional":
                query = QUERIES.TRANSLATE_AZURE;
                resultKey = "translate_azure";
                break;
            default:
                query = QUERIES.TRANSLATE_GPT4_OMNI;
                resultKey = "translate_gpt4_omni";
                to = LANGUAGE_NAMES[to];
                break;
        }

        apolloClient
            .query({
                query: query,
                variables: {
                    text: stripHTML(inputText),
                    to: to,
                },
            })
            .then((e) => {
                setLoading(false);
                setTranslatedText(e.data[resultKey].result.trim());
            })
            .catch((e) => {
                setLoading(false);
                console.error(e);
                setTranslatedText(
                    `An error occurred while trying to get translation.\n\n${e.toString()}`,
                );
            });
    };

    return (
        <div className="flex flex-col h-full gap-2">
            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row gap-2 items-center">
                    <div className="flex-1 flex gap-2 items-center justify-between w-full">
                        <span className="text-sm whitespace-nowrap">
                            {t("Translate to")}
                        </span>
                        &nbsp;&nbsp;
                        <select
                            className="lb-select"
                            id="translateLanguageSelect"
                            name="language"
                            value={translationLanguage}
                            onChange={(e) => {
                                const language = e.target.value;
                                setTranslationLanguage(language);
                                setTranslatedText("");
                            }}
                        >
                            {Object.entries(LANGUAGE_NAMES).map(
                                ([code, name]) => (
                                    <option key={code} value={code}>
                                        {t(name)}
                                    </option>
                                ),
                            )}
                        </select>
                    </div>
                    <div className="flex-1 flex gap-2 items-center justify-between w-full">
                        <select
                            className="lb-select"
                            name="strategy"
                            id="translateStrategySelect"
                            value={translationStrategy}
                            onChange={(e) => {
                                const strategy = e.target.value;
                                setTranslationStrategy(strategy);
                                setTranslatedText("");
                            }}
                        >
                            <option value="GPT-4-OMNI">
                                {t("Fast, High Quality (GPT-4-OMNI)")}
                            </option>
                            <option value="GPT-4">
                                {t("Slower, Reliable (GPT-4)")}
                            </option>
                            <option value="traditional">
                                {t("Fastest (Azure)")}
                            </option>
                        </select>
                        <LoadingButton
                            disabled={!inputText || inputText.length === 0}
                            loading={loading}
                            className="lb-primary"
                            text={t("Translating")}
                            onClick={() => {
                                setLoading(true);
                                executeTranslation(
                                    translationStrategy,
                                    inputText,
                                    translationLanguage,
                                );
                            }}
                        >
                            {t("Translate")}
                        </LoadingButton>
                    </div>
                </div>
            </div>
            <div className="flex-1 flex gap-2 h-full">
                <div
                    className={classNames(
                        "flex-1",
                        translatedText ? "hidden sm:block" : "block",
                    )}
                >
                    <textarea
                        className="lb-input w-full h-full p-2 border border-gray-300 rounded-md resize-none text-xs"
                        dir="auto"
                        disabled={loading}
                        rows={10}
                        value={inputText}
                        onChange={(e) =>
                            setTranslationInputText(e.target.value)
                        }
                    />
                </div>
                <div
                    className={classNames(
                        !translatedText ? "hidden sm:block" : "block",
                        "flex-1 relative",
                    )}
                >
                    <div
                        className={`h-full rounded-md ${translationLanguage === "ar" ? "rtl" : "ltr"}`}
                    >
                        {translatedText && (
                            <div className="absolute top-1 end-2 flex gap-1 items-center">
                                <CopyButton item={translatedText} />
                                <button
                                    className="text-gray-300"
                                    onClick={() => setTranslatedText("")}
                                >
                                    <XIcon
                                        className="h-6 w-6"
                                        aria-hidden="true"
                                    />
                                </button>
                            </div>
                        )}
                        <textarea
                            readOnly
                            className="w-full h-full lb-input p-2 border border-gray-300 rounded-md resize-none text-xs bg-gray-100"
                            dir="auto"
                            rows={10}
                            value={translatedText}
                        />
                    </div>

                    {showEditLink && translatedText && (
                        <button
                            className="flex gap-2 items-center absolute bottom-1 p-2 px-14 bg-gray-200 border border-gray-300 border-l-0 border-b-0 rounded-bl rounded-br hover:bg-gray-300 active:bg-gray-400"
                            onClick={() => {
                                setWriteInputText(translatedText);
                                router.push("/write");
                            }}
                        >
                            {t("Start editing")}
                            <span>
                                {language === "ar" ? (
                                    <FaChevronLeft />
                                ) : (
                                    <FaChevronRight />
                                )}
                            </span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Translation;
