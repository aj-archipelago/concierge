import { useState, useCallback } from "react";

/**
 * Generic selection hook for lists of items (media, chats, etc.)
 * @param {Function} getItemId - Function to extract ID from an item, defaults to item.cortexRequestId
 */
export const useItemSelection = (
    getItemId = (item) => item.cortexRequestId,
) => {
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [selectedObjects, setSelectedObjects] = useState([]);
    const [lastSelectedId, setLastSelectedId] = useState(null);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setSelectedObjects([]);
        setLastSelectedId(null);
    }, []);

    const addToSelection = useCallback(
        (item) => {
            const id = getItemId(item);
            setSelectedIds((prev) => new Set([...prev, id]));
            setSelectedObjects((prev) => [...prev, item]);
            setLastSelectedId(id);
        },
        [getItemId],
    );

    const removeFromSelection = useCallback(
        (itemId) => {
            setSelectedIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(itemId);
                return newSet;
            });
            setSelectedObjects((prev) =>
                prev.filter((item) => getItemId(item) !== itemId),
            );
        },
        [getItemId],
    );

    const toggleSelection = useCallback(
        (item) => {
            const id = getItemId(item);
            const isSelected = selectedIds.has(id);
            if (isSelected) {
                removeFromSelection(id);
            } else {
                addToSelection(item);
            }
        },
        [selectedIds, addToSelection, removeFromSelection, getItemId],
    );

    const selectRange = useCallback(
        (items, startIndex, endIndex) => {
            const newSelectedIds = new Set(selectedIds);
            const newSelectedObjects = [...selectedObjects];

            for (let i = startIndex; i <= endIndex; i++) {
                const item = items[i];
                if (item) {
                    const id = getItemId(item);
                    if (!newSelectedIds.has(id)) {
                        newSelectedIds.add(id);
                        newSelectedObjects.push(item);
                    }
                }
            }

            setSelectedIds(newSelectedIds);
            setSelectedObjects(newSelectedObjects);
        },
        [selectedIds, selectedObjects, getItemId],
    );

    return {
        selectedIds,
        selectedObjects,
        lastSelectedId,
        setLastSelectedId,
        clearSelection,
        addToSelection,
        removeFromSelection,
        toggleSelection,
        selectRange,
        // Direct setters for complex operations
        setSelectedIds,
        setSelectedObjects,
    };
};

// Legacy export for backward compatibility with media code
export const useMediaSelection = () => {
    const selection = useItemSelection((item) => item.cortexRequestId);

    const getImageCount = useCallback(() => {
        return selection.selectedObjects.filter((img) => img.type === "image")
            .length;
    }, [selection.selectedObjects]);

    const getVideoCount = useCallback(() => {
        return selection.selectedObjects.filter((img) => img.type === "video")
            .length;
    }, [selection.selectedObjects]);

    return {
        selectedImages: selection.selectedIds,
        selectedImagesObjects: selection.selectedObjects,
        lastSelectedImage: selection.lastSelectedId,
        setLastSelectedImage: selection.setLastSelectedId,
        clearSelection: selection.clearSelection,
        addToSelection: selection.addToSelection,
        removeFromSelection: selection.removeFromSelection,
        toggleSelection: selection.toggleSelection,
        selectRange: selection.selectRange,
        getImageCount,
        getVideoCount,
        setSelectedImages: selection.setSelectedIds,
        setSelectedImagesObjects: selection.setSelectedObjects,
    };
};
