"use client";

import { useApolloClient } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaDownload, FaTrash, FaCheck, FaPlus } from "react-icons/fa";
import { Modal } from "../../../@/components/ui/modal";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";
import ProgressUpdate from "../editor/ProgressUpdate";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "../../../@/components/ui/tooltip";
import ChatImage from "./ChatImage";
import axios from "../../../app/utils/axios-client";
import { hashMediaFile } from "../../utils/mediaUtils";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from "../../../@/components/ui/alert-dialog";

function ImagesPage() {
    const [prompt, setPrompt] = useState("");
    const [generationPrompt, setGenerationPrompt] = useState("");
    const [quality, setQuality] = useState("draft");
    const [images, setImages] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [selectedImages, setSelectedImages] = useState(new Set());
    const [lastSelectedImage, setLastSelectedImage] = useState(null);
    const [isModifyMode, setIsModifyMode] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
    const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] =
        useState(false);
    const promptRef = useRef(null);

    useEffect(() => {
        const imagesInStorage = localStorage.getItem("generated-images");
        if (imagesInStorage) {
            setImages(JSON.parse(imagesInStorage));
        }
    }, []);

    const apolloClient = useApolloClient();

    const generateImage = useCallback(
        async (prompt, inputImageUrl = null) => {
            const variables = {
                text: prompt,
                async: true,
                model: inputImageUrl
                    ? "replicate-flux-kontext-max"
                    : quality === "draft"
                      ? "replicate-flux-1-schnell"
                      : "replicate-flux-11-pro",
                input_image: inputImageUrl || "",
                aspectRatio: inputImageUrl ? "match_input_image" : undefined,
            };

            setLoading(true);
            try {
                const { data } = await apolloClient.query({
                    query: QUERIES.IMAGE_FLUX,
                    variables,
                    fetchPolicy: "network-only",
                });
                setLoading(false);

                if (data?.image_flux?.result) {
                    const requestId = data?.image_flux?.result;

                    setImages((prevImages) => {
                        const filteredImages = prevImages.filter(
                            (img) => img.cortexRequestId !== requestId,
                        );
                        const newImage = {
                            cortexRequestId: requestId,
                            prompt: prompt,
                            created: Math.floor(Date.now() / 1000),
                            inputImageUrl: inputImageUrl,
                        };
                        const updatedImages = [newImage, ...filteredImages];
                        localStorage.setItem(
                            "generated-images",
                            JSON.stringify(updatedImages),
                        );
                        setSelectedImages(new Set([requestId]));
                        setTimeout(() => {
                            promptRef.current && promptRef.current.focus();
                        }, 0);
                        return updatedImages;
                    });

                    return data;
                }
            } catch (error) {
                setLoading(false);
                console.error("Error generating image:", error);
            }
        },
        [apolloClient, quality],
    );

    useEffect(() => {
        setIsModifyMode(selectedImages.size === 1 || selectedImages.size === 2);
    }, [selectedImages]);

    const handleModifySelected = useCallback(async () => {
        if (!prompt.trim() || selectedImages.size === 0) return;

        const newSelectedIds = [];

        const selectedImageObjects = images.filter(
            (img) => selectedImages.has(img.cortexRequestId) && img.url,
        );

        for (const image of selectedImageObjects) {
            const variables = {
                text: prompt,
                async: true,
                model: "replicate-flux-kontext-max",
                input_image: image.url,
                aspectRatio: "match_input_image",
            };

            setLoading(true);
            try {
                const { data } = await apolloClient.query({
                    query: QUERIES.IMAGE_FLUX,
                    variables,
                    fetchPolicy: "network-only",
                });
                setLoading(false);

                if (data?.image_flux?.result) {
                    const requestId = data?.image_flux?.result;
                    newSelectedIds.push(requestId);

                    setImages((prevImages) => {
                        // Do NOT replace the old image; instead, add a new tile on top
                        const combinedPrompt = image.prompt
                            ? `${image.prompt} - ${prompt}`
                            : prompt;
                        const newImage = {
                            cortexRequestId: requestId,
                            prompt: combinedPrompt,
                            created: Math.floor(Date.now() / 1000),
                            inputImageUrl: image.url,
                        };
                        const updatedImages = [newImage, ...prevImages];
                        localStorage.setItem(
                            "generated-images",
                            JSON.stringify(updatedImages),
                        );
                        return updatedImages;
                    });
                }
            } catch (error) {
                setLoading(false);
                console.error("Error modifying image:", error);
            }
        }

        // Select the newly created modified images and focus prompt box
        if (newSelectedIds.length > 0) {
            setSelectedImages(new Set(newSelectedIds));
            setTimeout(() => {
                promptRef.current && promptRef.current.focus();
            }, 0);
        } else {
            // If no new ids (shouldn't happen), clear selection
            setSelectedImages(new Set());
        }
    }, [prompt, selectedImages, images, apolloClient]);

    const handleCombineSelected = useCallback(async () => {
        if (!prompt.trim() || selectedImages.size !== 2) return;

        const selectedImageObjects = images.filter(
            (img) => selectedImages.has(img.cortexRequestId) && img.url,
        );

        if (selectedImageObjects.length !== 2) return;

        const [image1, image2] = selectedImageObjects;
        const variables = {
            text: prompt,
            async: true,
            model: "replicate-multi-image-kontext-max",
            input_image: image1.url,
            input_image_2: image2.url,
            aspectRatio: "1:1",
        };

        setLoading(true);
        try {
            const { data } = await apolloClient.query({
                query: QUERIES.IMAGE_FLUX,
                variables,
                fetchPolicy: "network-only",
            });
            setLoading(false);

            if (data?.image_flux?.result) {
                const requestId = data?.image_flux?.result;

                setImages((prevImages) => {
                    const combinedPrompt = `${image1.prompt} + ${image2.prompt} - ${prompt}`;
                    const newImage = {
                        cortexRequestId: requestId,
                        prompt: combinedPrompt,
                        created: Math.floor(Date.now() / 1000),
                        inputImageUrl: image1.url,
                    };
                    const updatedImages = [newImage, ...prevImages];
                    localStorage.setItem(
                        "generated-images",
                        JSON.stringify(updatedImages),
                    );
                    setSelectedImages(new Set([requestId]));
                    setTimeout(() => {
                        promptRef.current && promptRef.current.focus();
                    }, 0);
                    return updatedImages;
                });
            }
        } catch (error) {
            setLoading(false);
            console.error("Error combining images:", error);
        }
    }, [prompt, selectedImages, images, apolloClient]);

    const handleFileUpload = useCallback(
        async (file) => {
            if (!file) return;

            setIsUploading(true);
            setUploadProgress(0);
            const serverUrl = "/media-helper?useGoogle=true";

            try {
                // Start showing upload progress
                const fileHash = await hashMediaFile(file);

                // Check if file exists first
                try {
                    const checkResponse = await axios.get(
                        `${serverUrl}&hash=${fileHash}&checkHash=true`,
                    );
                    if (
                        checkResponse.status === 200 &&
                        checkResponse.data?.url
                    ) {
                        // File exists, use the existing URL
                        const newImage = {
                            cortexRequestId: `upload-${Date.now()}`,
                            prompt: t("Uploaded image"),
                            created: Math.floor(Date.now() / 1000),
                            url: checkResponse.data.url,
                            gcs: checkResponse.data.gcs,
                        };

                        setImages((prevImages) => {
                            const updatedImages = [newImage, ...prevImages];
                            localStorage.setItem(
                                "generated-images",
                                JSON.stringify(updatedImages),
                            );
                            setSelectedImages(
                                new Set([newImage.cortexRequestId]),
                            );
                            setTimeout(() => {
                                promptRef.current && promptRef.current.focus();
                            }, 0);
                            return updatedImages;
                        });
                        setIsUploading(false);
                        setUploadProgress(0);
                        return;
                    }
                } catch (err) {
                    if (err.response?.status !== 404) {
                        console.error("Error checking file hash:", err);
                    }
                }

                // If we get here, we need to upload the file
                const formData = new FormData();
                formData.append("hash", fileHash);
                formData.append("file", file, file.name);

                const response = await axios.post(
                    `${serverUrl}&hash=${fileHash}`,
                    formData,
                    {
                        headers: {
                            "Content-Type": "multipart/form-data",
                        },
                        onUploadProgress: (progressEvent) => {
                            const percentCompleted = Math.round(
                                (progressEvent.loaded * 100) /
                                    progressEvent.total,
                            );
                            setUploadProgress(percentCompleted);
                        },
                    },
                );

                if (response.data?.url) {
                    // Create a new image entry with the uploaded file
                    const newImage = {
                        cortexRequestId: `upload-${Date.now()}`,
                        prompt: t("Uploaded image"),
                        created: Math.floor(Date.now() / 1000),
                        url: response.data.url,
                        gcs: response.data.gcs,
                    };

                    setImages((prevImages) => {
                        const updatedImages = [newImage, ...prevImages];
                        localStorage.setItem(
                            "generated-images",
                            JSON.stringify(updatedImages),
                        );
                        setSelectedImages(new Set([newImage.cortexRequestId]));
                        setTimeout(() => {
                            promptRef.current && promptRef.current.focus();
                        }, 0);
                        return updatedImages;
                    });
                }
            } catch (error) {
                console.error("Error uploading file:", error);
            } finally {
                setIsUploading(false);
                setUploadProgress(0);
            }
        },
        [t],
    );

    const handleFileSelect = useCallback(
        (event) => {
            const file = event.target.files[0];
            if (file) {
                handleFileUpload(file);
            }
        },
        [handleFileUpload],
    );

    images.sort((a, b) => {
        return b.created - a.created;
    });

    const handleBulkAction = useCallback(
        (action) => {
            if (action === "delete") {
                setShowDeleteSelectedConfirm(true);
            } else if (action === "download") {
                images.forEach((img) => {
                    if (selectedImages.has(img.cortexRequestId) && img.url) {
                        window.open(img.url, "_blank");
                    }
                });
                setSelectedImages(new Set());
            }
        },
        [images, selectedImages],
    );

    const handleDeleteSelected = useCallback(() => {
        const newImages = images.filter(
            (img) => !selectedImages.has(img.cortexRequestId),
        );
        setImages(newImages);
        localStorage.setItem("generated-images", JSON.stringify(newImages));
        setSelectedImages(new Set());
        setShowDeleteSelectedConfirm(false);
    }, [images, selectedImages]);

    const handleDeleteAll = useCallback(() => {
        setImages([]);
        localStorage.setItem("generated-images", "[]");
        setSelectedImages(new Set());
        setShowDeleteAllConfirm(false);
    }, []);

    const imageTiles = useMemo(() => {
        return [
            <div key="upload-tile" className="image-tile">
                <label className="image-wrapper cursor-pointer flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
                    <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileSelect}
                        disabled={isUploading}
                    />
                    {isUploading ? (
                        <div className="flex flex-col items-center gap-2 text-gray-500">
                            <ProgressUpdate
                                initialText={t("Uploading...")}
                                progress={uploadProgress}
                                autoDuration={0}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-500">
                            <FaPlus className="text-2xl" />
                            <span className="text-sm">{t("Upload Image")}</span>
                        </div>
                    )}
                </label>
            </div>,
            ...images.map((image) => {
                const key = image?.cortexRequestId;

                return (
                    <ImageTile
                        key={`image-${key}`}
                        image={image}
                        quality={quality}
                        selectedImages={selectedImages}
                        setSelectedImages={setSelectedImages}
                        lastSelectedImage={lastSelectedImage}
                        setLastSelectedImage={setLastSelectedImage}
                        images={images}
                        onClick={() => {
                            if (image?.url) {
                                setSelectedImage(image);
                                setShowModal(true);
                            }
                        }}
                        onRegenerate={async () => {
                            // Remove the old tile first (regenerate replaces it)
                            setImages((prevImages) => {
                                const newImages = prevImages.filter(
                                    (img) =>
                                        img.cortexRequestId !==
                                        image.cortexRequestId,
                                );
                                localStorage.setItem(
                                    "generated-images",
                                    JSON.stringify(newImages),
                                );
                                return newImages;
                            });

                            if (image.inputImageUrl) {
                                // Regenerate modification with same input image
                                await generateImage(
                                    image.prompt,
                                    image.inputImageUrl || image.url,
                                );
                            } else {
                                // Regular regenerate
                                await generateImage(image.prompt);
                            }
                        }}
                        onGenerationComplete={(requestId, data) => {
                            const newImages = [...images];

                            const imageIndex = newImages.findIndex(
                                (img) => img.cortexRequestId === requestId,
                            );

                            if (imageIndex !== -1) {
                                newImages[imageIndex] = {
                                    ...newImages[imageIndex],
                                    ...data,
                                    url: Array.isArray(data?.result?.output)
                                        ? data?.result?.output?.[0]
                                        : data?.result?.output,
                                    regenerating: false,
                                };
                            }
                            setImages(newImages);
                            localStorage.setItem(
                                "generated-images",
                                JSON.stringify(newImages),
                            );
                        }}
                        onDelete={(image) => {
                            const newImages = images.filter((img) => {
                                return (
                                    img.cortexRequestId !==
                                    image.cortexRequestId
                                );
                            });

                            if (generationPrompt === image.prompt) {
                                setGenerationPrompt("");
                            }

                            setImages(newImages);
                            localStorage.setItem(
                                "generated-images",
                                JSON.stringify(newImages),
                            );

                            // Clear selection if the deleted image was selected
                            if (selectedImages.has(image.cortexRequestId)) {
                                const newSelectedImages = new Set(
                                    selectedImages,
                                );
                                newSelectedImages.delete(image.cortexRequestId);
                                setSelectedImages(newSelectedImages);
                            }
                        }}
                    />
                );
            }),
        ];
    }, [
        images,
        generationPrompt,
        generateImage,
        quality,
        selectedImages,
        t,
        handleFileSelect,
        isUploading,
        uploadProgress,
        lastSelectedImage,
        setLastSelectedImage,
    ]);

    return (
        <div>
            <div className="flex flex-col gap-4">
                <div className="mb-4">
                    <form
                        className="flex flex-col sm:flex-row gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!prompt.trim()) return;
                            setGenerationPrompt(prompt);
                            if (isModifyMode) {
                                if (selectedImages.size === 2) {
                                    handleCombineSelected();
                                } else if (selectedImages.size === 1) {
                                    handleModifySelected();
                                } else {
                                    generateImage(prompt);
                                }
                            } else {
                                generateImage(prompt);
                            }
                        }}
                    >
                        <textarea
                            className="lb-input flex-grow min-h-[2.5rem] max-h-32 resize-y"
                            placeholder={
                                isModifyMode
                                    ? selectedImages.size === 2
                                        ? t(
                                              "Enter prompt to combine selected images",
                                          )
                                        : selectedImages.size === 1
                                          ? t(
                                                "Enter prompt to modify selected image",
                                            )
                                          : t(
                                                "Enter prompt and set quality to generate image",
                                            )
                                    : t(
                                          "Enter prompt and set quality to generate image",
                                      )
                            }
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (!prompt.trim()) return;
                                    setGenerationPrompt(prompt);
                                    if (isModifyMode) {
                                        if (selectedImages.size === 2) {
                                            handleCombineSelected();
                                        } else if (selectedImages.size === 1) {
                                            handleModifySelected();
                                        } else {
                                            generateImage(prompt);
                                        }
                                    } else {
                                        generateImage(prompt);
                                    }
                                }
                            }}
                            ref={promptRef}
                        />

                        <div className="flex gap-2">
                            {!isModifyMode && (
                                <select
                                    className="lb-input w-full sm:w-fit"
                                    value={quality}
                                    onChange={(e) => setQuality(e.target.value)}
                                >
                                    <option value="draft">{t("Draft")}</option>
                                    <option value="high">
                                        {t("High Quality")}
                                    </option>
                                </select>
                            )}

                            <LoadingButton
                                className="lb-primary w-full sm:w-auto"
                                style={{ whiteSpace: "nowrap" }}
                                loading={loading}
                                text={
                                    isModifyMode
                                        ? selectedImages.size === 2
                                            ? t("Combining...")
                                            : t("Modifying...")
                                        : t("Generating...")
                                }
                                type="submit"
                                disabled={
                                    !prompt.trim() ||
                                    (isModifyMode && selectedImages.size === 0)
                                }
                            >
                                {isModifyMode
                                    ? selectedImages.size === 2
                                        ? t("Combine")
                                        : t("Modify")
                                    : t("Generate")}
                            </LoadingButton>
                        </div>
                    </form>
                </div>
            </div>

            {images.length > 0 && (
                <div className="flex justify-end items-center gap-2 mb-4">
                    <div className="text-sm text-gray-500 mr-2">
                        {selectedImages.size > 0 && (
                            <span>
                                {selectedImages.size} {t("selected")}
                            </span>
                        )}
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                    disabled={selectedImages.size === 0}
                                    onClick={() => handleBulkAction("download")}
                                >
                                    <FaDownload />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t("Download Selected")}
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                    disabled={selectedImages.size === 0}
                                    onClick={() => handleBulkAction("delete")}
                                >
                                    <FaTrash />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t("Delete Selected")}
                            </TooltipContent>
                        </Tooltip>

                        <div className="w-px h-4 bg-gray-300 mx-1" />

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                                    onClick={() =>
                                        setShowDeleteAllConfirm(true)
                                    }
                                >
                                    <FaTrash />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>{t("Delete All")}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}

            <div className="image-grid">{imageTiles}</div>
            <ImageModal
                show={showModal}
                image={selectedImage}
                onHide={() => {
                    setShowModal(false);
                    setTimeout(() => {
                        setSelectedImage(null);
                    }, 300);
                }}
            />

            <AlertDialog
                open={showDeleteAllConfirm}
                onOpenChange={setShowDeleteAllConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete All Images?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete all images? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction autoFocus onClick={handleDeleteAll}>
                            {t("Delete All")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={showDeleteSelectedConfirm}
                onOpenChange={setShowDeleteSelectedConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete Selected Images?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete the selected images? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={handleDeleteSelected}
                        >
                            {t("Delete Selected")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function Progress({
    requestId,
    prompt,
    quality,
    onDataReceived,
    inputImageUrl,
}) {
    const [data] = useState(null);
    const { t } = useTranslation();

    if (!requestId) {
        return null;
    }

    if (requestId && !data) {
        return (
            <ProgressUpdate
                initialText={t("Generating...")}
                requestId={requestId}
                setFinalData={(data) => {
                    // If data is already an object with error, pass it through
                    if (data?.result?.error) {
                        onDataReceived({ result: data.result, prompt });
                        return;
                    }

                    try {
                        const parsedData = JSON.parse(data);
                        onDataReceived({ result: { ...parsedData }, prompt });
                    } catch (e) {
                        console.error("Error parsing data", e);
                        onDataReceived({
                            result: {
                                error: {
                                    code: "PARSE_ERROR",
                                    message: "Failed to generate image",
                                },
                            },
                            prompt,
                        });
                    }
                }}
                autoDuration={
                    !inputImageUrl && quality === "draft" ? 1000 : 10000
                }
            />
        );
    }
}

function ImageTile({
    image,
    onClick,
    onDelete,
    onRegenerate,
    onGenerationComplete,
    quality,
    selectedImages,
    setSelectedImages,
    lastSelectedImage,
    setLastSelectedImage,
    images,
}) {
    const [loadError, setLoadError] = useState(false);
    const url = image?.url;
    const { t } = useTranslation();
    const expired = image?.expires < Date.now() / 1000;
    const { cortexRequestId, prompt, result, regenerating } = image || {};
    const { code, message } = result?.error || {};
    const isSelected = selectedImages.has(cortexRequestId);

    const handleSelection = (e) => {
        e.stopPropagation();
        const newSelectedImages = new Set(selectedImages);

        if (e.shiftKey && lastSelectedImage) {
            // Find indices of last selected and current image
            const lastIndex = images.findIndex(
                (img) => img.cortexRequestId === lastSelectedImage,
            );
            const currentIndex = images.findIndex(
                (img) => img.cortexRequestId === cortexRequestId,
            );

            // Select all images between last selected and current
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);

            for (let i = start; i <= end; i++) {
                newSelectedImages.add(images[i].cortexRequestId);
            }
        } else {
            // Normal click behavior
            if (isSelected) {
                newSelectedImages.delete(cortexRequestId);
            } else {
                newSelectedImages.add(cortexRequestId);
            }
        }

        setSelectedImages(newSelectedImages);
        setLastSelectedImage(cortexRequestId);
    };

    return (
        <div className="image-tile">
            {/* Selection checkbox - always visible */}
            <div
                className={`selection-checkbox ${isSelected ? "selected" : ""}`}
                onClick={handleSelection}
            >
                <FaCheck
                    className={`text-sm ${isSelected ? "opacity-100" : "opacity-0"}`}
                />
            </div>

            <div className="image-wrapper" onClick={onClick}>
                {regenerating ? (
                    <div className="h-full bg-gray-50 p-4 text-sm flex items-center justify-center">
                        <ProgressComponent />
                    </div>
                ) : !expired && url && !loadError ? (
                    <ChatImage
                        src={url}
                        alt={prompt}
                        onError={() => setLoadError(true)}
                        onLoad={() => setLoadError(false)}
                        className="w-full h-full object-cover object-center"
                    />
                ) : (
                    <div className="h-full bg-gray-50 p-4 text-sm flex items-center justify-center">
                        {cortexRequestId &&
                            !url &&
                            !code &&
                            (result ? <NoImageError /> : <ProgressComponent />)}
                        {code === "ERR_BAD_REQUEST" && <BadRequestError />}
                        {code && code !== "ERR_BAD_REQUEST" && <OtherError />}
                        {expired && url && <ExpiredImageComponent />}
                        {loadError && <ExpiredImageComponent />}
                    </div>
                )}
            </div>

            <div className="image-prompt" title={prompt}>
                {prompt}
            </div>

            <div className="image-actions">
                <button
                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                    title={t("Download")}
                    onClick={(e) => {
                        e.stopPropagation();
                        window.open(url, "_blank");
                    }}
                >
                    <FaDownload />
                </button>
                <button
                    className="lb-icon-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:bg-transparent dark:border-gray-600 dark:hover:border-gray-500"
                    title={t("Delete")}
                    onClick={(e) => {
                        if (
                            window.confirm(
                                t(
                                    "Are you sure you want to delete this image?",
                                ),
                            )
                        ) {
                            onDelete(image);
                        }
                        e.stopPropagation();
                    }}
                >
                    <FaTrash />
                </button>
            </div>
        </div>
    );

    function ProgressComponent() {
        return (
            <div>
                <Progress
                    requestId={cortexRequestId}
                    prompt={prompt}
                    quality={quality}
                    onDataReceived={(data) =>
                        onGenerationComplete(cortexRequestId, data)
                    }
                    inputImageUrl={image?.inputImageUrl}
                />
            </div>
        );
    }

    function BadRequestError() {
        return (
            <div className="text-center">
                <div>{t("Image blocked by safety system.")}</div>
            </div>
        );
    }

    function OtherError() {
        return (
            <div className="text-center flex flex-col items-center justify-center h-full">
                <div>{`${t("Image Error: ")} ${message}`}</div>
                <div className="mt-4">
                    <button
                        className="lb-primary"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRegenerate();
                        }}
                    >
                        {t("Regenerate")}
                    </button>
                </div>
            </div>
        );
    }

    function ExpiredImageComponent() {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <div className="mb-4 text-center">
                    {t("Image expired or not available.")}
                </div>
                <div>
                    <button
                        className="lb-primary"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRegenerate();
                        }}
                    >
                        {t("Regenerate")}
                    </button>
                </div>
            </div>
        );
    }

    function NoImageError() {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center">
                    {t("Generation completed but no image was produced.")}
                </div>
                <div className="mt-4">
                    <button
                        className="lb-primary"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRegenerate();
                        }}
                    >
                        {t("Regenerate")}
                    </button>
                </div>
            </div>
        );
    }
}

function ImageModal({ show, image, onHide }) {
    const { t } = useTranslation();

    return (
        <Modal show={show} onHide={onHide} title={t("Generated image")}>
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                <div className="sm:basis-9/12">
                    <ChatImage
                        className="rounded-md w-full"
                        src={image?.url}
                        alt={image?.prompt}
                    />
                </div>
                <div className="sm:basis-3/12 flex flex-col max-h-[400px]">
                    <div className="sm:text-sm">
                        <ImageInfo data={image} />
                    </div>
                    <div className="flex-grow overflow-hidden">
                        <div className="font-semibold text-gray-500 sm:text-sm">
                            {t("Prompt")}
                        </div>
                        <div className="h-full">
                            <textarea
                                className="w-full p-2 rounded-md bg-gray-50 sm:text-sm overflow-y-auto"
                                value={image?.prompt}
                                readOnly
                                style={{
                                    height: "100%",
                                    maxHeight: "calc(100% - 1.5rem)",
                                    minHeight: "3rem",
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="justify-end flex gap-2 mt-4">
                <button className="lb-primary" onClick={onHide}>
                    {t("Close")}
                </button>
            </div>
        </Modal>
    );
}

function ImageInfo({ data }) {
    const url = data?.url;
    const { t } = useTranslation();

    return (
        <div>
            <div className="mb-2">
                <div>
                    <div className="font-semibold text-gray-500">
                        {t("Created")}
                    </div>
                </div>
                <div>
                    {data?.created
                        ? new Date(data?.created * 1000).toLocaleString()
                        : t("(not found)")}
                </div>
            </div>
            <div className="mb-2">
                <div>
                    <div className="font-semibold text-gray-500">
                        {t("Flux URL")}
                    </div>
                </div>
                <div style={{ lineBreak: "anywhere" }}>
                    {url ? (
                        <a
                            href={url}
                            target="_blank"
                            className="text-sky-500"
                            rel="noreferrer"
                        >
                            {t("Link")}
                        </a>
                    ) : (
                        t("URL not found")
                    )}
                </div>
            </div>
        </div>
    );
}

export default ImagesPage;
