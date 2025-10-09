import { useState, useCallback } from "react";

export const useMediaSelection = () => {
    const [selectedImages, setSelectedImages] = useState(new Set());
    const [selectedImagesObjects, setSelectedImagesObjects] = useState([]);
    const [lastSelectedImage, setLastSelectedImage] = useState(null);

    const clearSelection = useCallback(() => {
        setSelectedImages(new Set());
        setSelectedImagesObjects([]);
        setLastSelectedImage(null);
    }, []);

    const addToSelection = useCallback((image) => {
        setSelectedImages((prev) => new Set([...prev, image.cortexRequestId]));
        setSelectedImagesObjects((prev) => [...prev, image]);
        setLastSelectedImage(image.cortexRequestId);
    }, []);

    const removeFromSelection = useCallback((cortexRequestId) => {
        setSelectedImages((prev) => {
            const newSet = new Set(prev);
            newSet.delete(cortexRequestId);
            return newSet;
        });
        setSelectedImagesObjects((prev) =>
            prev.filter((img) => img.cortexRequestId !== cortexRequestId),
        );
    }, []);

    const toggleSelection = useCallback(
        (image) => {
            const isSelected = selectedImages.has(image.cortexRequestId);
            if (isSelected) {
                removeFromSelection(image.cortexRequestId);
            } else {
                addToSelection(image);
            }
        },
        [selectedImages, addToSelection, removeFromSelection],
    );

    const selectRange = useCallback(
        (images, startIndex, endIndex) => {
            const newSelectedImages = new Set(selectedImages);
            const newSelectedImagesObjects = [...selectedImagesObjects];

            for (let i = startIndex; i <= endIndex; i++) {
                const image = images[i];
                if (!newSelectedImages.has(image.cortexRequestId)) {
                    newSelectedImages.add(image.cortexRequestId);
                    newSelectedImagesObjects.push(image);
                }
            }

            setSelectedImages(newSelectedImages);
            setSelectedImagesObjects(newSelectedImagesObjects);
        },
        [selectedImages, selectedImagesObjects],
    );

    const getImageCount = useCallback(() => {
        return selectedImagesObjects.filter((img) => img.type === "image")
            .length;
    }, [selectedImagesObjects]);

    const getVideoCount = useCallback(() => {
        return selectedImagesObjects.filter((img) => img.type === "video")
            .length;
    }, [selectedImagesObjects]);

    return {
        selectedImages,
        selectedImagesObjects,
        lastSelectedImage,
        setLastSelectedImage,
        clearSelection,
        addToSelection,
        removeFromSelection,
        toggleSelection,
        selectRange,
        getImageCount,
        getVideoCount,
        // Direct setters for complex operations
        setSelectedImages,
        setSelectedImagesObjects,
    };
};
