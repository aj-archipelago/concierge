import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApolloClient } from "@apollo/client";
import { useRouter } from "next/navigation";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Edit } from "lucide-react";
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

// Get optimal font family and direction for target language
const getLanguageStyles = (languageCode) => {
    const rtlLanguages = ["ar", "he"];
    const isRTL = rtlLanguages.includes(languageCode);

    const fontMap = {
        ar: "'Noto Sans Arabic', 'Segoe UI', Arial, sans-serif",
        ja: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif",
        zh: "'Noto Sans SC', 'Noto Sans TC', 'Microsoft YaHei', 'PingFang SC', sans-serif",
        ko: "'Noto Sans KR', 'Nanum Gothic', 'Malgun Gothic', sans-serif",
        he: "'Noto Sans Hebrew', 'Arial Hebrew', sans-serif",
        th: "'Noto Sans Thai', 'Sarabun', sans-serif",
        hi: "'Noto Sans Devanagari', sans-serif",
        ru: "'Noto Sans', 'Roboto', 'Arial', sans-serif",
        default: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    };

    return {
        fontFamily: fontMap[languageCode] || fontMap.default,
        direction: isRTL ? "rtl" : "ltr",
    };
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
    const { direction } = useContext(LanguageContext);
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
        let model;

        switch (strategy) {
            case "GPT-5":
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "oai-gpt5-chat";
                to = LANGUAGE_NAMES[to];
                break;
            case "GPT-4-OMNI":
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "oai-gpt4o";
                to = LANGUAGE_NAMES[to];
                break;
            case "traditional":
                query = QUERIES.TRANSLATE_AZURE;
                resultKey = "translate_azure";
                break;
            default:
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "oai-gpt5-chat";
                to = LANGUAGE_NAMES[to];
                break;
        }

        const variables = {
            text: stripHTML(inputText),
            to: to,
        };

        if (model) {
            variables.model = model;
        }

        apolloClient
            .query({
                query: query,
                variables: variables,
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
                            <option value="GPT-5">
                                {t("Best, Newest (GPT-5)")}
                            </option>
                            <option value="GPT-4-OMNI">
                                {t("Fast, High Quality (GPT-4-OMNI)")}
                            </option>
                            <option value="traditional">
                                {t("Fastest (Azure)")}
                            </option>
                        </select>
                        <LoadingButton
                            disabled={!inputText || inputText.length === 0}
                            loading={loading}
                            className="lb-primary whitespace-nowrap min-w-[120px]"
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
                <div
                    className={classNames(
                        "flex-1 flex gap-2 grow",
                        direction === "rtl" && "flex-row-reverse",
                    )}
                >
                    <div
                        className={classNames(
                            "flex-1",
                            activeTab === "input" ? "block" : "hidden sm:block",
                        )}
                    >
                        <textarea
                            className="lb-input w-full h-full p-2 border border-gray-300 rounded-md resize-none text-base sm:text-sm"
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
                        <div className="h-full relative rounded-md">
                            {translatedText &&
                                (() => {
                                    const isTargetRTL = ["ar", "he"].includes(
                                        translationLanguage,
                                    );
                                    return (
                                        <div
                                            className={classNames(
                                                "absolute top-1 flex gap-1 items-center z-10",
                                                isTargetRTL
                                                    ? "start-1 flex-row-reverse"
                                                    : "end-1",
                                            )}
                                        >
                                            {showEditLink && (
                                                <button
                                                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 active:text-gray-900 dark:active:text-gray-200 cursor-pointer"
                                                    onClick={() => {
                                                        debouncedUpdateUserState(
                                                            {
                                                                write: {
                                                                    text: translatedText,
                                                                },
                                                            },
                                                        );
                                                        router.push("/write");
                                                    }}
                                                    title={t("Start editing")}
                                                >
                                                    <Edit />
                                                </button>
                                            )}
                                            <CopyButton
                                                item={translatedText}
                                                className="static"
                                            />
                                        </div>
                                    );
                                })()}
                            {(() => {
                                const languageStyles =
                                    getLanguageStyles(translationLanguage);
                                return (
                                    <textarea
                                        readOnly
                                        className="w-full h-full lb-input p-2 border border-gray-300 dark:border-gray-600 rounded-md resize-none bg-gray-100 dark:bg-gray-800 text-base sm:text-sm"
                                        dir={languageStyles.direction}
                                        style={{
                                            fontFamily:
                                                languageStyles.fontFamily,
                                        }}
                                        placeholder={t(
                                            "Translation will appear here...",
                                        )}
                                        rows={10}
                                        value={translatedText || ""}
                                    />
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </Tabs>
        </div>
    );
}

export default Translation;
