import { createSlice } from "@reduxjs/toolkit";

export const mainPaneIndexerSlice = createSlice({
    name: "mainPaneIndexer",
    initialState: {
        isLoading: false,
        error: null,
    },
    reducers: {
        setApiLoading: (state) => {
            state.isLoading = true;
        },
        clearApiLoading: (state) => {
            state.isLoading = false;
        },
        apiError: (state, action) => {
            state.error = action.payload;
        },
    },
});

export const { setApiLoading, clearApiLoading, apiError } =
    mainPaneIndexerSlice.actions;

export default mainPaneIndexerSlice.reducer;
