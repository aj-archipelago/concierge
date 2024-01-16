import { useEffect } from "react";
import { useState } from "react";
import Translation from "../translate/Translation";

function TranslateModalContent({ text, onSelect }) {
    const [inputText, setInputText] = useState(text);
    const [translatedText, setTranslatedText] = useState(null);
    const [translationLanguage, setTranslationLanguage] = useState("en");
    const [translationStrategy, setTranslationStrategy] = useState("translate");

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
            setTranslationStrategy={(t) => setTranslationStrategy(t)}
        />
    );
}

export default TranslateModalContent;
