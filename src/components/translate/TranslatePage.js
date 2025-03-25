"use client";

import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../../App";
import Translation from "./Translation";

function TranslatePage() {
    const { userState, debouncedUpdateUserState } = useContext(AuthContext);

    const [inputText, setInputText] = useState("");
    const [translatedText, setTranslatedText] = useState("");
    const [translationLanguage, setTranslationLanguage] = useState("en");
    const [translationStrategy, setTranslationStrategy] = useState("translate");

    useEffect(() => {
        if (userState?.translate?.inputText) {
            setInputText(userState.translate.inputText);
        }
        if (userState?.translate?.translationStrategy) {
            setTranslationStrategy(userState.translate.translationStrategy);
        }
        if (userState?.translate?.translationLanguage) {
            setTranslationLanguage(userState.translate.translationLanguage);
        }
        if (userState?.translate?.translatedText) {
            setTranslatedText(userState.translate.translatedText);
        }
    }, [userState]);

    return (
        <Translation
            inputText={inputText}
            translationStrategy={translationStrategy}
            translationLanguage={translationLanguage}
            translatedText={translatedText}
            setTranslatedText={(t) => {
                setTranslatedText(t);
                debouncedUpdateUserState({
                    translate: {
                        inputText,
                        translationStrategy,
                        translationLanguage,
                        translatedText: t,
                    },
                });
            }}
            setTranslationInputText={(t) => {
                setInputText(t);
                debouncedUpdateUserState({
                    translate: {
                        inputText: t,
                        translationStrategy,
                        translationLanguage,
                        translatedText,
                    },
                });
            }}
            setTranslationLanguage={(t) => {
                setTranslationLanguage(t);
                debouncedUpdateUserState({
                    translate: {
                        inputText,
                        translationStrategy,
                        translationLanguage: t,
                        translatedText,
                    },
                });
            }}
            setTranslationStrategy={(t) => {
                setTranslationStrategy(t);
                debouncedUpdateUserState({
                    translate: {
                        inputText,
                        translationStrategy: t,
                        translationLanguage,
                        translatedText,
                    },
                });
            }}
            showEditLink={true}
        />
    );
}

export default TranslatePage;
