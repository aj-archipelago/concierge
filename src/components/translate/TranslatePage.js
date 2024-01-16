"use client";

import { useDispatch, useSelector } from "react-redux";
import {
    setTranslationInputText,
    setTranslatedText,
    setTranslationLanguage,
    setTranslationStrategy,
} from "../../stores/translateSlice";
import { setWriteInputText } from "../../stores/writeSlice";
import Translation from "./Translation";

function TranslatePage() {
    const inputText = useSelector((state) => state.translate?.inputText);
    const translationStrategy = useSelector(
        (state) => state.translate?.translationStrategy,
    );
    const translationLanguage = useSelector(
        (state) => state.translate?.translationLanguage,
    );
    const translatedText = useSelector(
        (state) => state.translate?.translatedText,
    );

    const dispatch = useDispatch();

    return (
        <Translation
            inputText={inputText}
            translationStrategy={translationStrategy}
            translationLanguage={translationLanguage}
            translatedText={translatedText}
            setTranslatedText={(t) => dispatch(setTranslatedText(t))}
            setTranslationInputText={(t) =>
                dispatch(setTranslationInputText(t))
            }
            setTranslationLanguage={(t) => dispatch(setTranslationLanguage(t))}
            setTranslationStrategy={(t) => dispatch(setTranslationStrategy(t))}
            setWriteInputText={(t) => dispatch(setWriteInputText(t))}
            showEditLink={true}
        />
    );
}

export default TranslatePage;
