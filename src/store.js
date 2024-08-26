import { configureStore } from "@reduxjs/toolkit";
import chatReducer from "./stores/chatSlice";
import codeReducer from "./stores/codeSlice";
import translateReducer from "./stores/translateSlice";
import transcribeReducer from "./stores/transcribeSlice";
import docReducer from "./stores/docSlice";
import mainPaneIndexerReducer from "./stores/mainPaneIndexerSlice";
import fileUploadReducer from "./stores/fileUploadSlice";

export default configureStore({
    reducer: {
        chat: chatReducer,
        code: codeReducer,
        transcribe: transcribeReducer,
        translate: translateReducer,
        doc: docReducer,
        mainPaneIndexer: mainPaneIndexerReducer,
        fileUpload: fileUploadReducer,
    },
});

export const makeStore = () => {
    return configureStore({
        reducer: {
            chat: chatReducer,
            code: codeReducer,
            transcribe: transcribeReducer,
            translate: translateReducer,
            doc: docReducer,
            mainPaneIndexer: mainPaneIndexerReducer,
        },
        fileUpload: fileUploadReducer,
    });
};
