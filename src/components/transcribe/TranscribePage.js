"use client";

import { useDispatch, useSelector } from "react-redux";
import {
    setDataText as setDataTextAction,
    setTranscriptionOption as setTranscriptionOptionAction,
    setAsyncComplete as setAsyncCompleteAction,
} from "../../stores/transcribeSlice";
import Transcribe from "./Transcribe";
import { useCallback } from "react";

function TranscribePage({ onSelect }) {
    const dispatch = useDispatch();
    const dataText = useSelector((state) => state.transcribe.dataText);
    const asyncComplete = useSelector(
        (state) => state.transcribe.asyncComplete,
    );
    const transcriptionOption = useSelector(
        (state) => state.transcribe.transcriptionOption,
    );

    const setDataText = useCallback(
        (text) => {
            dispatch(setDataTextAction(text));
        },
        [dispatch],
    );

    const setTranscriptionOption = (option) => {
        dispatch(setTranscriptionOptionAction(option));
    };

    const setAsyncComplete = useCallback(
        (complete) => {
            dispatch(setAsyncCompleteAction(complete));
        },
        [dispatch],
    );

    return (
        <Transcribe
            dataText={dataText}
            transcriptionOption={transcriptionOption}
            asyncComplete={asyncComplete}
            setDataText={setDataText}
            setTranscriptionOption={setTranscriptionOption}
            setAsyncComplete={setAsyncComplete}
            onSelect={onSelect}
        />
    );
}

export default TranscribePage;
