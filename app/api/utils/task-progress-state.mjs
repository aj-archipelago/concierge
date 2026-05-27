export function hasProgressPayload(value) {
    return value !== null && value !== undefined && value !== "";
}

export function rememberLatestProgressPayload(
    currentState,
    { rawData, parsedData, rawInfo, parsedInfo },
) {
    return {
        dataObject: hasProgressPayload(rawData)
            ? parsedData
            : currentState.dataObject,
        infoObject: hasProgressPayload(rawInfo)
            ? parsedInfo
            : currentState.infoObject,
    };
}

export function resolveCompletionPayload({
    currentDataObject,
    currentInfoObject,
    lastDataObject,
    lastInfoObject,
}) {
    return {
        dataObject: currentDataObject ?? lastDataObject ?? null,
        infoObject: currentInfoObject ?? lastInfoObject ?? null,
    };
}

export function hasUsableMediaCompletionData(data) {
    return !!(
        data &&
        typeof data === "object" &&
        (data.url || data.azureUrl || data.gcsUrl || data.hash || data.blobPath)
    );
}
