import { useEffect } from "react";
import { useState } from "react";
import {
    normalizeTranslationStrategy,
    TRANSLATION_STRATEGIES,
} from "../translate/Translation";
import Translation from "../translate/Translation";

function TranslateModalContent({ text, onSelect }) {
    const [inputText, setInputText] = useState(text);
    const [translatedText, setTranslatedText] = useState("");
    const [translationLanguage, setTranslationLanguage] = useState("en");
    const [translationStrategy, setTranslationStrategy] = useState(
        TRANSLATION_STRATEGIES.GPT_55,
    );

    useEffect(() => {
        setInputText(text);
    }, [text]);

    return (
        <Translation
            inputText={inputText}
            translationStrategy={translationStrategy}
            translationLanguage={translationLanguage}
            translatedText={translatedText}
            setTranslatedText={(t) => {
                setTranslatedText(t);
                onSelect(t);
            }}
            setTranslationInputText={(t) => setInputText(t)}
            setTranslationLanguage={(t) => setTranslationLanguage(t)}
            setTranslationStrategy={(t) =>
                setTranslationStrategy(normalizeTranslationStrategy(t))
            }
        />
    );
}

export default TranslateModalContent;
