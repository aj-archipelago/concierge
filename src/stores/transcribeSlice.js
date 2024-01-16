import { createSlice } from "@reduxjs/toolkit";

export const transcribeSlice = createSlice({
    name: "transcribe",
    initialState: {
        dataText: "",
        transcriptionOption: {
            responseFormat: "",
            wordTimestamped: false,
            textFormatted: false,
        },
        asyncComplete: false,
    },
    reducers: {
        // ... existing reducers
        setDataText: (state, action) => {
            const dataText = action.payload;
            state.dataText = dataText;
        },
        setTranscriptionOption: (state, action) => {
            const transcriptionOption = action.payload;
            state.transcriptionOption = transcriptionOption;
        },
        setAsyncComplete: (state, action) => {
            const asyncComplete = action.payload;
            state.asyncComplete = asyncComplete;
        },
    },
});

export const { setDataText, setTranscriptionOption, setAsyncComplete } =
    transcribeSlice.actions;

export default transcribeSlice.reducer;
