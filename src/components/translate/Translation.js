import { useApolloClient } from "@apollo/client";
import { useRouter } from "next/navigation";
import { useContext, useState } from "react";
import { Form } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
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
            case "GPT-4-TURBO":
                query = QUERIES.TRANSLATE_GPT4_TURBO;
                resultKey = "translate_gpt4_turbo";
                to = LANGUAGE_NAMES[to];
                break;
            case "traditional":
                query = QUERIES.TRANSLATE_AZURE;
                resultKey = "translate_azure";
                break;
            default:
                query = QUERIES.TRANSLATE_GPT4;
                resultKey = "translate_gpt4";
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
            <Form.Group>
                <div className="flex gap-2 items-center">
                    <div className="basis-1/2 flex gap-2 items-center">
                        {/* <div style={{ display: 'flex', fontSize: '0.9em', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}> */}
                        <span style={{ fontSize: "0.9em" }}>
                            {t("Translate to")}
                        </span>
                        &nbsp;&nbsp;
                        {/* </div> */}
                        <Form.Select
                            size="sm"
                            id="translateLanguageSelect"
                            name="language"
                            style={{ flex: 1 }}
                            value={translationLanguage}
                            onChange={(e) => {
                                const language = e.target.value;
                                setTranslationLanguage(language);
                                setTranslatedText("");
                            }}
                        >
                            <option value="en">{t("English")}</option>
                            <option value="ar">{t("Arabic")}</option>
                            <option value="bs">{t("Bosnian")}</option>
                            <option value="zh">{t("Chinese")}</option>
                            <option value="hr">{t("Croatian")}</option>
                            <option value="fr">{t("French")}</option>
                            <option value="de">{t("German")}</option>
                            <option value="it">{t("Italian")}</option>
                            <option value="ja">{t("Japanese")}</option>
                            <option value="ko">{t("Korean")}</option>
                            <option value="pt">{t("Portuguese")}</option>
                            <option value="ru">{t("Russian")}</option>
                            <option value="sr">{t("Serbian")}</option>
                            <option value="es">{t("Spanish")}</option>
                            <option value="tr">{t("Turkish")}</option>
                        </Form.Select>
                    </div>
                    <div className="flex gap-2 basis-1/2 items-center">
                        <Form.Select
                            size="sm"
                            name="strategy"
                            id="translateStrategySelect"
                            style={{ flex: 1 }}
                            value={translationStrategy}
                            onChange={(e) => {
                                const strategy = e.target.value;
                                setTranslationStrategy(strategy);
                                setTranslatedText("");
                            }}
                        >
                            <option value="GPT-4">
                                {t("Best Quality (GPT-4)")}
                            </option>
                            <option value="GPT-4-TURBO">
                                {t("Faster (GPT-4-TURBO)")}
                            </option>
                            <option value="traditional">
                                {t("Fastest (Azure)")}
                            </option>
                        </Form.Select>
                        <LoadingButton
                            disabled={!inputText || inputText.length === 0}
                            loading={loading}
                            className="lb-sm"
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
            </Form.Group>
            <div className="grow">
                <div className="flex gap-2 h-full">
                    <div style={{ flex: 1 }}>
                        <Form.Group
                            style={{ marginBottom: 10, height: "100%" }}
                        >
                            <Form.Control
                                as="textarea"
                                style={{
                                    resize: "none",
                                    direction: "auto",
                                    fontSize: "0.75em",
                                    height: "100%",
                                }}
                                dir="auto"
                                rows={10}
                                value={inputText}
                                onChange={(e) =>
                                    setTranslationInputText(e.target.value)
                                }
                            />
                        </Form.Group>
                    </div>
                    <div style={{ flex: 1, position: "relative" }}>
                        <Form.Group
                            dir={translationLanguage === "ar" ? "rtl" : "ltr"}
                            style={{
                                marginBottom: 10,
                                position: "relative",
                                height: "100%",
                            }}
                        >
                            {translatedText && (
                                <CopyButton
                                    item={translatedText}
                                    style={{
                                        position: "absolute",
                                        right: 2,
                                        top: 5,
                                    }}
                                    variant="opaque"
                                />
                            )}
                            <Form.Control
                                readOnly={true}
                                as="textarea"
                                className="translated-text"
                                dir="auto"
                                rows={10}
                                value={translatedText}
                            />
                            {showEditLink && translatedText && (
                                <button
                                    className="start-editing-button flex gap-3 items-center"
                                    onClick={(e) => {
                                        setWriteInputText(translatedText);
                                        router.push("/write");
                                    }}
                                >
                                    {t("Start editing")}{" "}
                                    <span>
                                        {language === "ar" ? (
                                            <FaChevronLeft />
                                        ) : (
                                            <FaChevronRight />
                                        )}
                                    </span>
                                </button>
                            )}
                        </Form.Group>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Translation;
