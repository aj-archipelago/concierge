import {
    PROCESSING_MEDIA_STATUSES,
    extractMediaBlobPathFromUrl,
    isLikelyRawStorageFileForProcessingMedia,
    isLikelyStorageFileForProcessingMedia,
    isProcessingGeneratedMediaItem,
    isStorageSyncMediaItem,
    normalizeMediaPath,
} from "../../utils/mediaDuplicateSuppression";

export {
    extractMediaBlobPathFromUrl,
    isLikelyRawStorageFileForProcessingMedia,
};

function getMediaContentKeys(item) {
    const hash = item?.hash;
    const blobPath =
        item?.blobPath ||
        extractMediaBlobPathFromUrl(item?.azureUrl) ||
        extractMediaBlobPathFromUrl(item?.url);

    return [
        hash && `hash:${hash}`,
        blobPath && `blob:${normalizeMediaPath(blobPath)}`,
        item?.azureUrl && `url:${item.azureUrl}`,
        item?.url && `url:${item.url}`,
        item?.gcsUrl && `gcs:${item.gcsUrl}`,
    ].filter(Boolean);
}

function getMediaIdentityKeys(item) {
    return [
        item?.taskId && `task:${item.taskId}`,
        item?.cortexRequestId && `request:${item.cortexRequestId}`,
        item?._id && `id:${item._id}`,
        ...getMediaContentKeys(item),
    ].filter(Boolean);
}

function getStatusRank(item) {
    const status = String(item?.status || "").toLowerCase();
    if (status === "completed") return 3;
    if (status === "failed") return 2;
    if (PROCESSING_MEDIA_STATUSES.has(status)) return 1;
    return 0;
}

function getMediaItemRank(item) {
    return [
        isStorageSyncMediaItem(item) ? 0 : 1,
        getStatusRank(item),
        Number(item?.completed || item?.created || 0),
    ];
}

function preferMediaItem(current, candidate) {
    if (!current) return candidate;

    const currentRank = getMediaItemRank(current);
    const candidateRank = getMediaItemRank(candidate);
    for (let index = 0; index < currentRank.length; index += 1) {
        if (candidateRank[index] > currentRank[index]) return candidate;
        if (candidateRank[index] < currentRank[index]) return current;
    }

    return current;
}

function isLikelyStorageSyncDuplicateOfPending(storageItem, pendingItems) {
    if (
        !isStorageSyncMediaItem(storageItem) ||
        String(storageItem?.status || "").toLowerCase() !== "completed"
    ) {
        return false;
    }

    return isLikelyStorageFileForProcessingMedia(storageItem, pendingItems);
}

export function dedupeMediaItemsForDisplay(
    mediaItems = [],
    { isSupportAsset = () => false } = {},
) {
    const visibleItems = mediaItems.filter((item) => !isSupportAsset(item));
    const pendingGeneratedItems = visibleItems.filter((item) =>
        isProcessingGeneratedMediaItem(item),
    );
    const groups = [];
    const itemsWithoutKeys = [];

    visibleItems
        .filter(
            (item) =>
                !isLikelyStorageSyncDuplicateOfPending(
                    item,
                    pendingGeneratedItems,
                ),
        )
        .forEach((item) => {
            const keys = new Set(getMediaIdentityKeys(item));
            if (keys.size === 0) {
                itemsWithoutKeys.push(item);
                return;
            }

            const matchingGroup = groups.find((group) =>
                Array.from(keys).some((key) => group.keys.has(key)),
            );

            if (!matchingGroup) {
                groups.push({ keys, item });
                return;
            }

            keys.forEach((key) => matchingGroup.keys.add(key));
            matchingGroup.item = preferMediaItem(matchingGroup.item, item);
        });

    return [...groups.map((group) => group.item), ...itemsWithoutKeys];
}
