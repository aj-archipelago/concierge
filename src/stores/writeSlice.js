import { createSlice } from "@reduxjs/toolkit";

export const writeSlice = createSlice({
    name: "write",
    initialState: {
        inputText: "",
    },
    reducers: {
        setWriteInputText: (state, action) => {
            const inputText = action.payload;
            state.inputText = inputText;
        },
    },
});

// Action creators are generated for each case reducer function
export const { setWriteInputText } = writeSlice.actions;

export default writeSlice.reducer;
