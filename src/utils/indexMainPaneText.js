import { COGNITIVE_DELETE, COGNITIVE_INSERT, client } from "../graphql";
import {
    setApiLoading,
    clearApiLoading,
    apiError,
} from "../stores/mainPaneIndexerSlice";

let apiCallInProgress = null;
let nextApiCallArgs = null;

const leadingEdgeDebounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            func(...args);
        };
        const callNow = !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
};

const callApi = async (inputText, contextId) => {
    // console.log(`API call with inputText: ${inputText}, contextId: ${contextId}`);

    const docId = `${contextId}-indexmainpane`;

    try {
        !nextApiCallArgs &&
            (await client.query({
                query: COGNITIVE_DELETE,
                variables: { contextId, docId },
                fetchPolicy: "network-only",
            }));

        if (!nextApiCallArgs) {
            const chunkedTexts = easyChunker(inputText);
            await Promise.all(
                chunkedTexts.map(
                    (chunk) =>
                        chunk &&
                        chunk.length > 0 &&
                        client.query({
                            query: COGNITIVE_INSERT,
                            variables: {
                                text: chunk,
                                privateData: true,
                                contextId,
                                docId,
                            },
                            fetchPolicy: "network-only",
                        }),
                ),
            );

            // console.log(`API call complete with ${inputText}`);
        }
    } catch (error) {
        console.error("Error executing queries:", error);
        throw error;
    }
};

const makeApiCall = async (inputText, contextId, dispatch) => {
    dispatch(setApiLoading());
    dispatch(apiError(null));
    if (apiCallInProgress) {
        // If a call is already in progress, store the new args to call with later
        nextApiCallArgs = { inputText, contextId };
    } else {
        try {
            apiCallInProgress = callApi(inputText, contextId);
            await apiCallInProgress;
        } catch (err) {
            console.error(`API call failed with ${err}`);
            dispatch(apiError(err.toString()));
        } finally {
            dispatch(clearApiLoading());
            apiCallInProgress = null;
            if (nextApiCallArgs !== null) {
                // If a new call was requested while we were running, start it now
                const nextArgs = nextApiCallArgs;
                nextApiCallArgs = null;
                makeApiCall(nextArgs.inputText, nextArgs.contextId, dispatch);
            }
        }
    }
};

const leadingEdgeDebouncedMakeApiCall = leadingEdgeDebounce(makeApiCall, 1000);

export function indexMainPaneText(text, contextId, dispatch) {
    leadingEdgeDebouncedMakeApiCall(text, contextId, dispatch);
}

export function easyChunker(text) {
    const result = [];
    const n = 10000;

    // If the text is less than n characters, just process it as is
    if (text.length <= n) {
        return [text];
    }

    let startIndex = 0;
    while (startIndex < text.length) {
        let endIndex = Math.min(startIndex + n, text.length);

        // Make sure we don't split in the middle of a sentence
        while (
            endIndex > startIndex &&
            text[endIndex] !== "." &&
            text[endIndex] !== " "
        ) {
            endIndex--;
        }

        // If we didn't find a sentence break, just split at n characters
        if (endIndex === startIndex) {
            endIndex = startIndex + n;
        }

        // Push the chunk to the result array
        result.push(text.substring(startIndex, endIndex));

        // Move the start index to the next chunk
        startIndex = endIndex;
    }

    return result;
}
