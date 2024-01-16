import { createSlice } from "@reduxjs/toolkit";

export const translateSlice = createSlice({
    name: "translate",
    initialState: {
        inputText: "",
        translationLanguage: "en",
        translationStrategy: "quick", // quick or context
        translatedText: "",
    },
    reducers: {
        setTranslationInputText: (state, action) => {
            const inputText = action.payload;
            state.inputText = inputText;
        },
        setTranslationLanguage: (state, action) => {
            const translationLanguage = action.payload;
            state.translationLanguage = translationLanguage;
        },
        setTranslationStrategy: (state, action) => {
            const translationStrategy = action.payload;
            state.translationStrategy = translationStrategy;
        },
        setTranslatedText: (state, action) => {
            const translatedText = action.payload;
            state.translatedText = translatedText;
        },
    },
});

// Action creators are generated for each case reducer function
export const {
    setTranslationInputText,
    setTranslationLanguage,
    setTranslationStrategy,
    setTranslatedText,
} = translateSlice.actions;

export default translateSlice.reducer;
