"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApolloClient } from "@apollo/client";
import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import classNames from "../../../app/utils/class-names";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { QUERIES } from "../../graphql";
import { stripHTML } from "../../utils/html.utils";
import CopyButton from "../CopyButton";
import LoadingButton from "../editor/LoadingButton";
import {
    getTranslationModel,
    getTranslationLanguageOptions,
    isGoogleTranslateLlmEnabled,
    LANGUAGE_NAMES,
    normalizeTranslationStrategy,
    TRANSLATION_STRATEGIES,
} from "./translationConfig";

export {
    getTranslationModel,
    getTranslationLanguageOptions,
    isGoogleTranslateLlmEnabled,
    LANGUAGE_NAMES,
    normalizeTranslationStrategy,
    TRANSLATION_STRATEGIES,
};

export function buildTranslationRequest(strategy, inputText, to) {
    const normalizedStrategy = normalizeTranslationStrategy(strategy);
    const targetLanguage = LANGUAGE_NAMES[to];
    if (
        !getTranslationLanguageOptions(normalizedStrategy).some(
            ([code]) => code === to,
        )
    ) {
        throw new Error(
            `${targetLanguage || to} is not supported by the selected translation provider.`,
        );
    }

    const isAzure = normalizedStrategy === TRANSLATION_STRATEGIES.AZURE;
    const isGoogleTranslateLlm =
        normalizedStrategy === TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM;
    const model = getTranslationModel(normalizedStrategy);
    const query = isAzure
        ? QUERIES.TRANSLATE_AZURE
        : isGoogleTranslateLlm
          ? QUERIES.TRANSLATE_GOOGLE_LLM
          : QUERIES.TRANSLATE;
    const resultKey = isAzure
        ? "translate_azure"
        : isGoogleTranslateLlm
          ? "translate_google_llm"
          : "translate";

    const variables = {
        text: stripHTML(inputText),
        to: isAzure || isGoogleTranslateLlm ? to : targetLanguage,
    };

    if (model) {
        variables.model = model;
    }

    return { query, resultKey, variables };
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
    const languageOptions = useMemo(
        () => getTranslationLanguageOptions(translationStrategy),
        [translationStrategy],
    );

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

    useEffect(() => {
        if (
            !languageOptions.some(([code]) => code === translationLanguage) &&
            translationLanguage !== "en"
        ) {
            setTranslationLanguage("en");
        }
    }, [languageOptions, setTranslationLanguage, translationLanguage]);

    const executeTranslation = (strategy, inputText, to) => {
        let request;
        try {
            request = buildTranslationRequest(strategy, inputText, to);
        } catch (e) {
            setLoading(false);
            console.error(e);
            setTranslatedText(
                `An error occurred while trying to get translation.\n\n${e.toString()}`,
            );
            return;
        }

        const { query, resultKey, variables } = request;

        apolloClient
            .query({
                query: query,
                variables: variables,
            })
            .then((e) => {
                if (e.errors?.length) {
                    throw new Error(e.errors[0].message);
                }
                const pathwayResult = e.data?.[resultKey];
                if (pathwayResult?.errors?.length) {
                    throw new Error(pathwayResult.errors[0]);
                }
                const result = pathwayResult?.result;
                if (typeof result !== "string") {
                    throw new Error("Translation service returned no result.");
                }
                setLoading(false);
                setTranslatedText(result.trim());
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
                            aria-label={t("Translate to")}
                            value={translationLanguage}
                            onChange={(e) => {
                                const language = e.target.value;
                                setTranslationLanguage(language);
                            }}
                        >
                            {languageOptions.map(([code, name]) => (
                                <option key={code} value={code}>
                                    {t(name)}
                                </option>
                            ))}
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
                            {isGoogleTranslateLlmEnabled() && (
                                <option
                                    value={
                                        TRANSLATION_STRATEGIES.GOOGLE_TRANSLATE_LLM
                                    }
                                >
                                    {t("Google TranslateLLM")}
                                </option>
                            )}
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
                                {t("Fastest Google (Gemini 3.5 Flash)")}
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
