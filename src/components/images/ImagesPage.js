"use client";

import { useApolloClient } from "@apollo/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaDownload, FaTrash, FaCheck } from "react-icons/fa";
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

    useEffect(() => {
        const imagesInStorage = localStorage.getItem("generated-images");
        if (imagesInStorage) {
            setImages(JSON.parse(imagesInStorage));
        }
    }, []);

    const apolloClient = useApolloClient();

    const generateImage = useCallback(
        async (prompt) => {
            const variables = {
                text: prompt,
                async: true,
                model:
                    quality === "draft"
                        ? "replicate-flux-1-schnell"
                        : "replicate-flux-11-pro",
            };

            setLoading(true);
            const { data } = await apolloClient.query({
                query: QUERIES.IMAGE_FLUX,
                variables,
                fetchPolicy: "network-only",
            });
            setLoading(false);

            if (data?.image_flux?.result) {
                const requestId = data?.image_flux?.result;

                // if already in images, ignore
                if (images.find((img) => img.cortexRequestId === requestId)) {
                    return data;
                }

                setImages((images) => {
                    const newImages = [...images];
                    newImages.unshift({
                        cortexRequestId: requestId,
                        prompt: prompt,
                        created: Math.floor(Date.now() / 1000),
                    });
                    return newImages;
                });
            }

            return data;
        },
        [apolloClient, images, quality],
    );

    images.sort((a, b) => {
        return b.created - a.created;
    });

    const handleBulkAction = useCallback(
        (action) => {
            if (action === "delete") {
                if (
                    window.confirm(
                        t("Are you sure you want to delete selected images?"),
                    )
                ) {
                    const newImages = images.filter(
                        (img) => !selectedImages.has(img.cortexRequestId),
                    );
                    setImages(newImages);
                    localStorage.setItem(
                        "generated-images",
                        JSON.stringify(newImages),
                    );
                }
            } else if (action === "download") {
                images.forEach((img) => {
                    if (selectedImages.has(img.cortexRequestId) && img.url) {
                        window.open(img.url, "_blank");
                    }
                });
            }
            setSelectedImages(new Set());
        },
        [images, selectedImages, t],
    );

    const imageTiles = useMemo(() => {
        return images.map((image) => {
            const key = image?.cortexRequestId;

            return (
                <ImageTile
                    key={`image-${key}`}
                    image={image}
                    quality={quality}
                    selectedImages={selectedImages}
                    setSelectedImages={setSelectedImages}
                    onClick={() => {
                        if (image?.url) {
                            setSelectedImage(image);
                            setShowModal(true);
                        }
                    }}
                    onRegenerate={async () => {
                        // Generate new image
                        const result = await generateImage(image.prompt);
                        if (result?.image_flux?.result) {
                            // Remove the old image and update its request ID
                            const newImages = images.map((img) => {
                                if (
                                    img.cortexRequestId ===
                                    image.cortexRequestId
                                ) {
                                    return {
                                        ...img,
                                        cortexRequestId:
                                            result.image_flux.result,
                                        url: undefined, // Clear the old URL
                                        expires: undefined, // Clear the expiration
                                    };
                                }
                                return img;
                            });
                            setImages(newImages);
                            localStorage.setItem(
                                "generated-images",
                                JSON.stringify(newImages),
                            );
                        }

                        // scroll to top
                        window.scrollTo(0, 0);
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
                                img.cortexRequestId !== image.cortexRequestId
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
                    }}
                />
            );
        });
    }, [images, generationPrompt, generateImage, quality, selectedImages]);

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
                            generateImage(prompt);
                        }}
                    >
                        <textarea
                            className="lb-input flex-grow min-h-[2.5rem] max-h-32 resize-y"
                            placeholder={t(
                                "Enter prompt and set quality to generate image",
                            )}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (!prompt.trim()) return;
                                    setGenerationPrompt(prompt);
                                    generateImage(prompt);
                                }
                            }}
                        />

                        <div className="flex gap-2">
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

                            <LoadingButton
                                className="lb-primary w-full sm:w-auto"
                                style={{ whiteSpace: "nowrap" }}
                                loading={loading}
                                text={t("Generating...")}
                                type="submit"
                                disabled={!prompt.trim()}
                            >
                                {t("Generate")}
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
                                    className="lb-icon-button"
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
                                    className="lb-icon-button"
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
                                    className="lb-icon-button"
                                    onClick={() => {
                                        if (
                                            window.confirm(
                                                t(
                                                    "Are you sure you want to delete all images?",
                                                ),
                                            )
                                        ) {
                                            setImages([]);
                                            localStorage.setItem(
                                                "generated-images",
                                                "[]",
                                            );
                                        }
                                    }}
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
        </div>
    );
}

function Progress({ requestId, prompt, quality, onDataReceived }) {
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
                autoDuration={quality === "draft" ? 1000 : 10000}
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
}) {
    const [loadError, setLoadError] = useState(false);
    const url = image?.url;
    const { t } = useTranslation();
    const expired = image?.expires < Date.now() / 1000;
    const { cortexRequestId, prompt, result } = image || {};
    const { code, message } = result?.error || {};
    const isSelected = selectedImages.has(cortexRequestId);

    return (
        <div className="image-tile">
            {/* Selection checkbox - always visible */}
            <div
                className={`selection-checkbox ${isSelected ? "selected" : ""}`}
                onClick={(e) => {
                    e.stopPropagation();
                    const newSelectedImages = new Set(selectedImages);
                    if (isSelected) {
                        newSelectedImages.delete(cortexRequestId);
                    } else {
                        newSelectedImages.add(cortexRequestId);
                    }
                    setSelectedImages(newSelectedImages);
                }}
            >
                <FaCheck
                    className={`text-sm ${isSelected ? "opacity-100" : "opacity-0"}`}
                />
            </div>

            <div className="image-wrapper" onClick={onClick}>
                {!expired && url && !loadError ? (
                    <img
                        src={url}
                        alt={prompt}
                        onError={() => setLoadError(true)}
                        onLoad={() => setLoadError(false)}
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
                    className="lb-sm lb-outline-secondary"
                    title={t("Download")}
                    onClick={(e) => {
                        e.stopPropagation();
                        window.open(url, "_blank");
                    }}
                >
                    <FaDownload />
                </button>
                <button
                    className="lb-sm lb-outline-secondary"
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
            <div className="text-center">
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
            <div>
                <div className="mb-4 text-center">
                    {t("Image expired or not available.")}
                </div>
                <div className="flex justify-center">
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
            <div className="text-center">
                <div>
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
                    <img
                        className="rounded-md"
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
