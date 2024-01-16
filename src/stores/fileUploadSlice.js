import { createSlice } from "@reduxjs/toolkit";

export const fileUploadSlice = createSlice({
    name: "fileUpload",
    initialState: {
        isLoading: false,
        error: null,
    },
    reducers: {
        setFileLoading: (state) => {
            state.isLoading = true;
        },
        clearFileLoading: (state) => {
            state.isLoading = false;
        },
        loadingError: (state, action) => {
            state.error = action.payload;
        },
    },
});

export const { setFileLoading, clearFileLoading, loadingError } =
    fileUploadSlice.actions;

export default fileUploadSlice.reducer;
