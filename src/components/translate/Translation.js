import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApolloClient } from "@apollo/client";
import { useRouter } from "next/navigation";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import classNames from "../../../app/utils/class-names";
import { AuthContext } from "../../App";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { QUERIES } from "../../graphql";
import { stripHTML } from "../../utils/html.utils";
import CopyButton from "../CopyButton";
import LoadingButton from "../editor/LoadingButton";

const LANGUAGE_NAMES = {
    en: "English",
    ar: "Arabic",
    es: "Spanish",
    fr: "French",
    bs: "Bosnian",
    hr: "Croatian",
    zh: "Chinese",
    de: "German",
    he: "Hebrew",
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
    showEditLink = false,
}) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const apolloClient = useApolloClient();
    const { language, direction } = useContext(LanguageContext);
    const [activeTab, setActiveTab] = useState("input");
    const { debouncedUpdateUserState } = useContext(AuthContext);

    const tabs = [
        {
            value: "input",
            label: t("Input"),
        },
        {
            value: "output",
            label: t("Output"),
        },
    ];

    if (direction === "rtl") {
        tabs.reverse();
    }

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
            case "subtitle":
                query = QUERIES.TRANSLATE_SUBTITLE;
                resultKey = "translate_subtitle";
                to = LANGUAGE_NAMES[to];
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
                setActiveTab("output");
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
        <div className="flex flex-col h-full gap-4">
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
                            {/* <option value="subtitle">
                                {t("Subtitle Translation (SRT)")}
                            </option> */}
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

            <Tabs
                className="w-full flex flex-col gap-2 grow"
                value={activeTab}
                onValueChange={(value) => setActiveTab(value)}
            >
                <TabsList className="w-full block sm:hidden">
                    {tabs.map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="w-1/2"
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <div className="flex-1 flex gap-2 grow">
                    <div
                        className={classNames(
                            "flex-1",
                            activeTab === "input" ? "block" : "hidden sm:block",
                        )}
                    >
                        <textarea
                            className="lb-input w-full h-full p-2 border border-gray-300 rounded-md resize-none"
                            dir="auto"
                            disabled={loading}
                            rows={10}
                            placeholder={t("Enter text to translate...")}
                            value={inputText}
                            onChange={(e) =>
                                setTranslationInputText(e.target.value)
                            }
                        />
                    </div>
                    <div
                        className={classNames(
                            activeTab === "output"
                                ? "block"
                                : "hidden sm:block",
                            "flex-1 relative",
                        )}
                    >
                        <div
                            className={`h-full relative rounded-md ${translationLanguage === "ar" ? "rtl" : "ltr"}`}
                        >
                            {translatedText && (
                                <div
                                    className={classNames(
                                        "absolute top-1 flex gap-1 items-center",
                                        translationLanguage === "ar"
                                            ? "start-7"
                                            : "end-1",
                                    )}
                                >
                                    <CopyButton item={translatedText} />
                                </div>
                            )}
                            <textarea
                                readOnly
                                className="w-full h-full lb-input p-2 border border-gray-300 rounded-md resize-none bg-gray-100"
                                dir="auto"
                                placeholder={t(
                                    "Translation will appear here...",
                                )}
                                rows={10}
                                value={translatedText}
                            />
                        </div>

                        {showEditLink && translatedText && (
                            <button
                                className="flex gap-2 items-center absolute bottom-1 p-2 px-14 bg-gray-200 border border-gray-300 border-l-0 border-b-0 rounded-bl rounded-br hover:bg-gray-300 active:bg-gray-400"
                                onClick={() => {
                                    debouncedUpdateUserState({
                                        write: {
                                            text: translatedText,
                                        },
                                    });
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
            </Tabs>
        </div>
    );
}

export default Translation;
