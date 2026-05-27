"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApolloClient } from "@apollo/client";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import classNames from "../../../app/utils/class-names";
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

export const TRANSLATION_STRATEGIES = {
    AZURE: "azure",
    GEMINI_31_PRO: "gemini31pro",
    GPT_55: "gpt55",
    CLAUDE_47_OPUS: "claude47opus",
    GEMINI_3_FLASH: "gemini3flash",
    GPT_54_MINI: "gpt54mini",
    CLAUDE_45_HAIKU: "claude45haiku",
    GPT_4O_LEGACY: "gpt4oLegacy",
};

const DEFAULT_TRANSLATION_STRATEGY = TRANSLATION_STRATEGIES.GPT_55;

const LEGACY_TRANSLATION_STRATEGY_MAP = {
    "GPT-5.2": TRANSLATION_STRATEGIES.GPT_55,
    "GPT-4-OMNI": TRANSLATION_STRATEGIES.GPT_4O_LEGACY,
    traditional: TRANSLATION_STRATEGIES.AZURE,
    translate: TRANSLATION_STRATEGIES.GPT_55,
    quick: TRANSLATION_STRATEGIES.GPT_55,
    context: TRANSLATION_STRATEGIES.GPT_55,
    gpt54: TRANSLATION_STRATEGIES.GPT_55,
};

export function normalizeTranslationStrategy(strategy) {
    if (Object.values(TRANSLATION_STRATEGIES).includes(strategy)) {
        return strategy;
    }

    return (
        LEGACY_TRANSLATION_STRATEGY_MAP[strategy] ||
        DEFAULT_TRANSLATION_STRATEGY
    );
}

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
}) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const apolloClient = useApolloClient();
    const { direction } = useContext(LanguageContext);
    const [activeTab, setActiveTab] = useState("input");

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

        switch (normalizeTranslationStrategy(strategy)) {
            case TRANSLATION_STRATEGIES.GEMINI_31_PRO:
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "gemini-pro-31-vision";
                to = LANGUAGE_NAMES[to];
                break;
            case TRANSLATION_STRATEGIES.GPT_55:
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "oai-gpt55";
                to = LANGUAGE_NAMES[to];
                break;
            case TRANSLATION_STRATEGIES.CLAUDE_47_OPUS:
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "claude-47-opus-vertex";
                to = LANGUAGE_NAMES[to];
                break;
            case TRANSLATION_STRATEGIES.GEMINI_3_FLASH:
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "gemini-flash-3-vision";
                to = LANGUAGE_NAMES[to];
                break;
            case TRANSLATION_STRATEGIES.GPT_54_MINI:
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "oai-gpt54-mini";
                to = LANGUAGE_NAMES[to];
                break;
            case TRANSLATION_STRATEGIES.CLAUDE_45_HAIKU:
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "claude-45-haiku-vertex";
                to = LANGUAGE_NAMES[to];
                break;
            case TRANSLATION_STRATEGIES.GPT_4O_LEGACY:
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "oai-gpt4o";
                to = LANGUAGE_NAMES[to];
                break;
            case TRANSLATION_STRATEGIES.AZURE:
                query = QUERIES.TRANSLATE_AZURE;
                resultKey = "translate_azure";
                break;
            default:
                query = QUERIES.TRANSLATE;
                resultKey = "translate";
                model = "oai-gpt55";
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
                            <option
                                value={TRANSLATION_STRATEGIES.GEMINI_31_PRO}
                            >
                                {t("Newest Google (Gemini 3.1 Pro)")}
                            </option>
                            <option value={TRANSLATION_STRATEGIES.GPT_55}>
                                {t("Newest OpenAI (GPT 5.5)")}
                            </option>
                            <option
                                value={TRANSLATION_STRATEGIES.CLAUDE_47_OPUS}
                            >
                                {t("Newest Anthropic (Opus 4.7)")}
                            </option>
                            <option
                                value={TRANSLATION_STRATEGIES.GEMINI_3_FLASH}
                            >
                                {t("Fastest Google (Gemini 3 Flash)")}
                            </option>
                            <option value={TRANSLATION_STRATEGIES.GPT_54_MINI}>
                                {t("Fastest OpenAI (GPT 5.4 Mini)")}
                            </option>
                            <option
                                value={TRANSLATION_STRATEGIES.CLAUDE_45_HAIKU}
                            >
                                {t("Fastest Anthropic (Haiku 4.5)")}
                            </option>
                            <option
                                value={TRANSLATION_STRATEGIES.GPT_4O_LEGACY}
                            >
                                {t("Fast, HQ, Legacy (GPT-4-OMNI)")}
                            </option>
                            <option value={TRANSLATION_STRATEGIES.AZURE}>
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
                                                "absolute top-2 flex gap-1 items-center z-10",
                                                isTargetRTL
                                                    ? "start-5 flex-row-reverse"
                                                    : "end-5",
                                            )}
                                        >
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
                                        className="w-full h-full lb-input p-2 border border-gray-300 dark:border-gray-600 rounded-md resize-none bg-gray-100 dark:bg-gray-800"
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
