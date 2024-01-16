import { createSlice } from "@reduxjs/toolkit";

export const codeSlice = createSlice({
    name: "code",
    initialState: {
        messages: [],
    },
    reducers: {
        addMessage: (state, action) => {
            const message = action.payload;
            state.messages.push(message);
        },
        clearChat: (state, action) => {
            state.messages = [];
            state.lastContext = "";
        },
    },
});

// Action creators are generated for each case reducer function
export const { addMessage, clearChat } = codeSlice.actions;

export default codeSlice.reducer;
