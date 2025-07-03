"use client";

import { useApolloClient } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaDownload, FaTrash, FaCheck, FaPlus, FaCog } from "react-icons/fa";
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
import "./Media.scss";

// Function to format image input for Veo models
const formatImageForVeo = (imageUrl) => {
    if (!imageUrl) return "";

    // Check if it's already in gs:// format
    if (imageUrl.startsWith("gs://")) {
        // Determine mime type from file extension
        const extension = imageUrl.split(".").pop().toLowerCase();
        const mimeType =
            {
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                png: "image/png",
                webp: "image/webp",
                gif: "image/gif",
            }[extension] || "image/jpeg";

        return JSON.stringify({ gcsUri: imageUrl, mimeType });
    }

    try {
        // Extract the GCS URI from the URL
        // Assuming the URL is in format: https://storage.googleapis.com/bucket-name/path/to/image.jpg
        const url = new URL(imageUrl);
        if (url.hostname === "storage.googleapis.com") {
            // Convert to gs:// format
            const gcsUri = `gs://${url.pathname.substring(1)}`;
            // Determine mime type from file extension
            const extension = url.pathname.split(".").pop().toLowerCase();
            const mimeType =
                {
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    png: "image/png",
                    webp: "image/webp",
                    gif: "image/gif",
                }[extension] || "image/jpeg";

            return JSON.stringify({ gcsUri, mimeType });
        }
    } catch (error) {
        console.warn("Error parsing image URL for Veo format:", error);
    }

    // If it's not a GCS URL or parsing fails, return the original URL as a fallback
    return imageUrl;
};

// Function to clean media data for localStorage storage
const cleanMediaDataForStorage = (mediaData) => {
    if (!mediaData) return mediaData;

    // Create a clean copy without large base64 data
    const cleanData = { ...mediaData };

    // Remove base64 data URLs from the main url field if they exist
    if (cleanData.url && cleanData.url.startsWith("data:")) {
        delete cleanData.url;
    }

    // Remove any base64 data from result if it exists
    if (cleanData.result?.response?.videos) {
        cleanData.result.response.videos = cleanData.result.response.videos.map(
            (video) => {
                const cleanVideo = { ...video };
                // Remove base64 data but keep other properties
                delete cleanVideo.bytesBase64Encoded;
                return cleanVideo;
            },
        );
    }

    return cleanData;
};

// Function to upload media URL to cloud storage
const uploadMediaToCloud = async (mediaUrl) => {
    try {
        const serverUrl = "/media-helper?useGoogle=true";

        // Handle base64 data URLs differently
        if (mediaUrl.startsWith("data:")) {
            // For base64 data URLs, we need to convert to blob and upload
            const response = await fetch(mediaUrl);
            const blob = await response.blob();

            // Create FormData with the blob
            const formData = new FormData();
            formData.append("file", blob, "video.mp4");

            const uploadResponse = await fetch(serverUrl, {
                method: "POST",
                body: formData,
            });

            if (!uploadResponse.ok) {
                const errorBody = await uploadResponse.text();
                throw new Error(
                    `Upload failed: ${uploadResponse.statusText}. Response body: ${errorBody}`,
                );
            }

            const data = await uploadResponse.json();

            // Validate that we have both Azure and GCS URLs
            const hasAzureUrl =
                data.url && data.url.includes("blob.core.windows.net");
            const hasGcsUrl = data.gcs;

            if (!hasAzureUrl || !hasGcsUrl) {
                throw new Error(
                    "Media file upload failed: Missing required storage URLs",
                );
            }

            return {
                azureUrl: data.url,
                gcsUrl: data.gcs,
            };
        } else {
            // Handle regular URLs
            const response = await fetch(
                `${serverUrl}&fetch=${encodeURIComponent(mediaUrl)}`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(
                    `Upload failed: ${response.statusText}. Response body: ${errorBody}`,
                );
            }

            const data = await response.json();

            // Validate that we have both Azure and GCS URLs
            const hasAzureUrl =
                data.url && data.url.includes("blob.core.windows.net");
            const hasGcsUrl = data.gcs;

            if (!hasAzureUrl || !hasGcsUrl) {
                throw new Error(
                    "Media file upload failed: Missing required storage URLs",
                );
            }

            return {
                azureUrl: data.url,
                gcsUrl: data.gcs,
            };
        }
    } catch (error) {
        console.error("Error uploading media to cloud:", error);
        throw error;
    }
};

// Function to get settings for a specific model
const getModelSettings = (settings, modelName) => {
    return settings.models?.[modelName] || getDefaultModelSettings(modelName);
};

// Function to get default settings for a model
const getDefaultModelSettings = (modelName) => {
    const defaults = {
        // Image models
        "replicate-flux-1-schnell": {
            type: "image",
            quality: "draft",
            aspectRatio: "1:1",
        },
        "replicate-flux-11-pro": {
            type: "image",
            quality: "high",
            aspectRatio: "1:1",
        },
        "replicate-flux-kontext-max": {
            type: "image",
            quality: "high",
            aspectRatio: "match_input_image",
        },
        "replicate-multi-image-kontext-max": {
            type: "image",
            quality: "high",
            aspectRatio: "1:1",
        },
        // Video models
        "veo-2.0-generate": {
            type: "video",
            aspectRatio: "16:9",
            duration: 5,
            generateAudio: false,
            resolution: "1080p",
            cameraFixed: false,
        },
        "veo-3.0-generate": {
            type: "video",
            aspectRatio: "16:9",
            duration: 8,
            generateAudio: false,
            resolution: "1080p",
            cameraFixed: false,
        },
        "replicate-seedance-1-pro": {
            type: "video",
            aspectRatio: "16:9",
            duration: 5,
            generateAudio: false,
            resolution: "1080p",
            cameraFixed: false,
        },
    };
    return defaults[modelName] || defaults["replicate-flux-1-schnell"];
};

// Function to migrate old settings to new structure
const migrateSettings = (oldSettings) => {
    if (oldSettings.models) {
        return oldSettings; // Already migrated
    }

    const newSettings = {
        models: {
            // Image models
            "replicate-flux-1-schnell": {
                type: "image",
                quality: oldSettings.image?.defaultQuality || "draft",
                aspectRatio: oldSettings.image?.defaultAspectRatio || "1:1",
            },
            "replicate-flux-11-pro": {
                type: "image",
                quality: "high",
                aspectRatio: oldSettings.image?.defaultAspectRatio || "1:1",
            },
            "replicate-flux-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "match_input_image",
            },
            "replicate-multi-image-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
            },
            // Video models
            "veo-2.0-generate": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: oldSettings.video?.defaultDuration || 5,
                generateAudio: oldSettings.video?.defaultGenerateAudio || false,
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
            "veo-3.0-generate": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: 8,
                generateAudio: oldSettings.video?.defaultGenerateAudio || false,
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
            "replicate-seedance-1-pro": {
                type: "video",
                aspectRatio: oldSettings.video?.defaultAspectRatio || "16:9",
                duration: oldSettings.video?.defaultDuration || 5,
                generateAudio: oldSettings.video?.defaultGenerateAudio || false,
                resolution: oldSettings.video?.defaultResolution || "1080p",
                cameraFixed: oldSettings.video?.defaultCameraFixed || false,
            },
        },
        // Keep legacy settings for backward compatibility
        image: oldSettings.image || {
            defaultQuality: "draft",
            defaultModel: "replicate-flux-1-schnell",
            defaultAspectRatio: "1:1",
        },
        video: oldSettings.video || {
            defaultModel: "veo-2.0-generate",
            defaultAspectRatio: "16:9",
            defaultDuration: 5,
            defaultGenerateAudio: false,
            defaultResolution: "1080p",
            defaultCameraFixed: false,
        },
    };

    return newSettings;
};

function MediaPage() {
    const [prompt, setPrompt] = useState("");
    const [generationPrompt, setGenerationPrompt] = useState("");
    const [quality, setQuality] = useState("draft");
    const [outputType, setOutputType] = useState("image"); // "image" or "video"
    const [selectedModel, setSelectedModel] = useState(
        "replicate-flux-1-schnell",
    ); // Current selected model
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({
        models: {
            // Image models
            "replicate-flux-1-schnell": {
                type: "image",
                quality: "draft",
                aspectRatio: "1:1",
            },
            "replicate-flux-11-pro": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
            },
            "replicate-flux-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "match_input_image",
            },
            "replicate-multi-image-kontext-max": {
                type: "image",
                quality: "high",
                aspectRatio: "1:1",
            },
            // Video models
            "veo-2.0-generate": {
                type: "video",
                aspectRatio: "16:9",
                duration: 5,
                generateAudio: false,
                resolution: "1080p",
                cameraFixed: false,
            },
            "veo-3.0-generate": {
                type: "video",
                aspectRatio: "16:9",
                duration: 8,
                generateAudio: false,
                resolution: "1080p",
                cameraFixed: false,
            },
            "replicate-seedance-1-pro": {
                type: "video",
                aspectRatio: "16:9",
                duration: 5,
                generateAudio: false,
                resolution: "1080p",
                cameraFixed: false,
            },
        },
        // Legacy support - will be migrated
        image: {
            defaultQuality: "draft",
            defaultModel: "replicate-flux-1-schnell",
            defaultAspectRatio: "1:1",
        },
        video: {
            defaultModel: "veo-2.0-generate",
            defaultAspectRatio: "16:9",
            defaultDuration: 5,
            defaultGenerateAudio: false,
            defaultResolution: "1080p",
            defaultCameraFixed: false,
        },
    });
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

    // Load settings from localStorage
    useEffect(() => {
        const savedSettings = localStorage.getItem("media-generation-settings");
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            const migratedSettings = migrateSettings(parsedSettings);
            setSettings(migratedSettings);
        }
    }, []);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem(
            "media-generation-settings",
            JSON.stringify(settings),
        );
    }, [settings]);

    // Apply default settings when output type changes
    useEffect(() => {
        if (outputType === "image") {
            // Use the first image model's quality setting
            const firstImageModel = Object.keys(settings.models || {}).find(
                (model) => settings.models[model]?.type === "image",
            );
            if (firstImageModel) {
                setSelectedModel(firstImageModel);
                setQuality(settings.models[firstImageModel].quality || "draft");
            }
        } else {
            // Use the first video model
            const firstVideoModel = Object.keys(settings.models || {}).find(
                (model) => settings.models[model]?.type === "video",
            );
            if (firstVideoModel) {
                setSelectedModel(firstVideoModel);
            }
        }
    }, [outputType, settings]);

    useEffect(() => {
        const mediaInStorage = localStorage.getItem("generated-media");
        if (mediaInStorage) {
            setImages(JSON.parse(mediaInStorage));
        }
    }, []);

    const apolloClient = useApolloClient();

    const generateMedia = useCallback(
        async (prompt, inputImageUrl = null) => {
            let variables = {};
            let query = null;

            if (outputType === "image") {
                // Use the selected model, or kontext-max for modifications
                const modelName = inputImageUrl
                    ? "replicate-flux-kontext-max"
                    : selectedModel;
                const modelSettings = getModelSettings(settings, modelName);

                variables = {
                    text: prompt,
                    async: true,
                    model: modelName,
                    input_image: inputImageUrl || "",
                    aspectRatio: inputImageUrl
                        ? "match_input_image"
                        : modelSettings.aspectRatio,
                };
                query = QUERIES.IMAGE_FLUX;
            } else {
                // Video generation
                const modelSettings = getModelSettings(settings, selectedModel);

                if (selectedModel === "replicate-seedance-1-pro") {
                    variables = {
                        text: prompt,
                        async: true,
                        model: selectedModel,
                        resolution: modelSettings.resolution,
                        aspectRatio: modelSettings.aspectRatio,
                        duration: modelSettings.duration,
                        camera_fixed: modelSettings.cameraFixed,
                        image: inputImageUrl || "",
                        seed: -1,
                    };
                    query = QUERIES.VIDEO_SEEDANCE;
                } else {
                    // Veo models
                    variables = {
                        text: prompt,
                        async: true,
                        image: formatImageForVeo(inputImageUrl),
                        video: "",
                        lastFrame: "",
                        model: selectedModel,
                        aspectRatio: modelSettings.aspectRatio,
                        durationSeconds: modelSettings.duration,
                        enhancePrompt: true,
                        generateAudio: modelSettings.generateAudio,
                        negativePrompt: "",
                        personGeneration: "allow_all",
                        sampleCount: 1,
                        storageUri: "",
                        location: "us-central1",
                        seed: -1,
                    };
                    query = QUERIES.VIDEO_VEO;
                }
            }

            setLoading(true);
            try {
                const { data } = await apolloClient.query({
                    query: query,
                    variables,
                    fetchPolicy: "network-only",
                });
                setLoading(false);

                const resultKey =
                    outputType === "image"
                        ? "image_flux"
                        : selectedModel === "replicate-seedance-1-pro"
                          ? "video_seedance"
                          : "video_veo";

                if (data?.[resultKey]?.result) {
                    const requestId = data[resultKey].result;

                    setImages((prevImages) => {
                        const filteredImages = prevImages.filter(
                            (img) => img.cortexRequestId !== requestId,
                        );
                        const newImage = {
                            cortexRequestId: requestId,
                            prompt: prompt,
                            created: Math.floor(Date.now() / 1000),
                            inputImageUrl: inputImageUrl,
                            type: outputType,
                            model: selectedModel,
                        };
                        const updatedImages = [newImage, ...filteredImages];
                        localStorage.setItem(
                            "generated-media",
                            JSON.stringify(updatedImages),
                        );
                        setTimeout(() => {
                            promptRef.current && promptRef.current.focus();
                        }, 0);
                        return updatedImages;
                    });

                    return data;
                }
            } catch (error) {
                setLoading(false);
                console.error(`Error generating ${outputType}:`, error);
            }
        },
        [apolloClient, outputType, selectedModel, settings],
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
            let variables = {};
            let query = null;

            if (outputType === "image") {
                const modelName = "replicate-flux-kontext-max";
                variables = {
                    text: prompt,
                    async: true,
                    model: modelName,
                    input_image: image.azureUrl || image.gcsUrl || image.url,
                    aspectRatio: "match_input_image",
                };
                query = QUERIES.IMAGE_FLUX;
            } else {
                // Video generation from image
                const modelSettings = getModelSettings(settings, selectedModel);

                if (selectedModel === "replicate-seedance-1-pro") {
                    variables = {
                        text: prompt,
                        async: true,
                        model: selectedModel,
                        resolution: modelSettings.resolution,
                        aspectRatio: modelSettings.aspectRatio,
                        duration: modelSettings.duration,
                        camera_fixed: modelSettings.cameraFixed,
                        image: image.azureUrl || image.url,
                        seed: -1,
                    };
                    query = QUERIES.VIDEO_SEEDANCE;
                } else {
                    // Veo models
                    variables = {
                        text: prompt,
                        async: true,
                        image: formatImageForVeo(
                            image.gcsUrl || image.azureUrl || image.url,
                        ),
                        video: "",
                        lastFrame: "",
                        model: selectedModel,
                        aspectRatio: modelSettings.aspectRatio,
                        durationSeconds: modelSettings.duration,
                        enhancePrompt: true,
                        generateAudio: modelSettings.generateAudio,
                        negativePrompt: "",
                        personGeneration: "allow_all",
                        sampleCount: 1,
                        storageUri: "",
                        location: "us-central1",
                        seed: -1,
                    };
                    query = QUERIES.VIDEO_VEO;
                }
            }

            setLoading(true);
            try {
                const { data } = await apolloClient.query({
                    query: query,
                    variables,
                    fetchPolicy: "network-only",
                });
                setLoading(false);

                const resultKey =
                    outputType === "image"
                        ? "image_flux"
                        : selectedModel === "replicate-seedance-1-pro"
                          ? "video_seedance"
                          : "video_veo";

                if (data?.[resultKey]?.result) {
                    const requestId = data[resultKey].result;
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
                            type: outputType,
                            model: selectedModel,
                        };
                        const updatedImages = [newImage, ...prevImages];
                        localStorage.setItem(
                            "generated-media",
                            JSON.stringify(updatedImages),
                        );
                        return updatedImages;
                    });
                }
            } catch (error) {
                setLoading(false);
                console.error(`Error modifying ${outputType}:`, error);
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
    }, [
        prompt,
        selectedImages,
        images,
        apolloClient,
        outputType,
        selectedModel,
        settings,
    ]);

    const handleCombineSelected = useCallback(async () => {
        if (!prompt.trim() || selectedImages.size !== 2) return;

        const selectedImageObjects = images.filter(
            (img) => selectedImages.has(img.cortexRequestId) && img.url,
        );

        if (selectedImageObjects.length !== 2) return;

        const [image1, image2] = selectedImageObjects;
        let variables = {};
        let query = null;

        if (outputType === "image") {
            const modelName = "replicate-multi-image-kontext-max";
            const modelSettings = getModelSettings(settings, modelName);

            variables = {
                text: prompt,
                async: true,
                model: modelName,
                input_image: image1.azureUrl || image1.url,
                input_image_2: image2.azureUrl || image2.url,
                aspectRatio: modelSettings.aspectRatio,
            };
            query = QUERIES.IMAGE_FLUX;
        } else {
            // For video generation, we'll use the first image as input
            // Video models don't support combining two images directly
            const modelSettings = getModelSettings(settings, selectedModel);

            if (selectedModel === "replicate-seedance-1-pro") {
                variables = {
                    text: prompt,
                    async: true,
                    model: selectedModel,
                    resolution: modelSettings.resolution,
                    aspectRatio: modelSettings.aspectRatio,
                    duration: modelSettings.duration,
                    camera_fixed: modelSettings.cameraFixed,
                    image: image1.azureUrl || image1.url,
                    seed: -1,
                };
                query = QUERIES.VIDEO_SEEDANCE;
            } else {
                // Veo models
                variables = {
                    text: prompt,
                    async: true,
                    image: formatImageForVeo(
                        image1.gcsUrl || image1.azureUrl || image1.url,
                    ),
                    video: "",
                    lastFrame: "",
                    model: selectedModel,
                    aspectRatio: modelSettings.aspectRatio,
                    durationSeconds: modelSettings.duration,
                    enhancePrompt: true,
                    generateAudio: modelSettings.generateAudio,
                    negativePrompt: "",
                    personGeneration: "allow_all",
                    sampleCount: 1,
                    storageUri: "",
                    location: "us-central1",
                    seed: -1,
                };
                query = QUERIES.VIDEO_VEO;
            }
        }

        setLoading(true);
        try {
            const { data } = await apolloClient.query({
                query: query,
                variables,
                fetchPolicy: "network-only",
            });
            setLoading(false);

            const resultKey =
                outputType === "image"
                    ? "image_flux"
                    : selectedModel === "replicate-seedance-1-pro"
                      ? "video_seedance"
                      : "video_veo";

            if (data?.[resultKey]?.result) {
                const requestId = data[resultKey].result;

                setImages((prevImages) => {
                    const combinedPrompt =
                        outputType === "image"
                            ? `${image1.prompt} + ${image2.prompt} - ${prompt}`
                            : `${image1.prompt} - ${prompt}`;
                    const newImage = {
                        cortexRequestId: requestId,
                        prompt: combinedPrompt,
                        created: Math.floor(Date.now() / 1000),
                        inputImageUrl: image1.url,
                        type: outputType,
                        model: selectedModel,
                    };
                    const updatedImages = [newImage, ...prevImages];
                    localStorage.setItem(
                        "generated-media",
                        JSON.stringify(updatedImages),
                    );
                    setTimeout(() => {
                        promptRef.current && promptRef.current.focus();
                    }, 0);
                    return updatedImages;
                });
            }
        } catch (error) {
            setLoading(false);
            console.error(
                `Error combining ${outputType === "image" ? "images" : "videos"}:`,
                error,
            );
        }
    }, [
        prompt,
        selectedImages,
        images,
        apolloClient,
        outputType,
        selectedModel,
        settings,
    ]);

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
                            azureUrl: checkResponse.data.url,
                            gcsUrl: checkResponse.data.gcs,
                            type: "image",
                        };

                        setImages((prevImages) => {
                            const updatedImages = [newImage, ...prevImages];
                            localStorage.setItem(
                                "generated-media",
                                JSON.stringify(updatedImages),
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
                    // Create a new media entry with the uploaded file
                    const newImage = {
                        cortexRequestId: `upload-${Date.now()}`,
                        prompt: t("Uploaded image"),
                        created: Math.floor(Date.now() / 1000),
                        url: response.data.url,
                        azureUrl: response.data.url,
                        gcsUrl: response.data.gcs,
                        type: "image",
                    };

                    setImages((prevImages) => {
                        const updatedImages = [newImage, ...prevImages];
                        localStorage.setItem(
                            "generated-media",
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
                    if (
                        selectedImages.has(img.cortexRequestId) &&
                        (img.azureUrl || img.url)
                    ) {
                        window.open(img.azureUrl || img.url, "_blank");
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

        // Clean data before storing in localStorage
        try {
            const cleanImages = newImages.map(cleanMediaDataForStorage);
            localStorage.setItem(
                "generated-media",
                JSON.stringify(cleanImages),
            );
        } catch (error) {
            console.warn("Failed to save to localStorage:", error);
        }

        setSelectedImages(new Set());
        setShowDeleteSelectedConfirm(false);
    }, [images, selectedImages]);

    const handleDeleteAll = useCallback(() => {
        setImages([]);
        // Clean data before storing in localStorage (empty array)
        try {
            localStorage.setItem("generated-media", JSON.stringify([]));
        } catch (error) {
            console.warn("Failed to save to localStorage:", error);
        }
        setSelectedImages(new Set());
        setShowDeleteAllConfirm(false);
    }, []);

    const mediaTiles = useMemo(() => {
        return [
            <div key="upload-tile" className="media-tile">
                <label className="media-wrapper cursor-pointer flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
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

                                // Clean data before storing in localStorage
                                try {
                                    const cleanImages = newImages.map(
                                        cleanMediaDataForStorage,
                                    );
                                    localStorage.setItem(
                                        "generated-media",
                                        JSON.stringify(cleanImages),
                                    );
                                } catch (error) {
                                    console.warn(
                                        "Failed to save to localStorage:",
                                        error,
                                    );
                                }

                                return newImages;
                            });

                            if (image.inputImageUrl) {
                                // Regenerate modification with same input image
                                await generateMedia(
                                    image.prompt,
                                    image.azureUrl ||
                                        image.inputImageUrl ||
                                        image.url,
                                );
                            } else {
                                // Regular regenerate
                                await generateMedia(image.prompt);
                            }
                        }}
                        onGenerationComplete={async (requestId, data) => {
                            const newImages = [...images];

                            const imageIndex = newImages.findIndex(
                                (img) => img.cortexRequestId === requestId,
                            );

                            if (imageIndex !== -1) {
                                let mediaUrl = null;

                                // Handle different response structures based on media type
                                if (
                                    newImages[imageIndex]?.type === "video" &&
                                    newImages[imageIndex]?.model?.includes(
                                        "veo",
                                    )
                                ) {
                                    // Veo video response structure
                                    console.log("Veo response data:", data);

                                    // Check for the direct Veo response structure
                                    if (
                                        data?.result?.response?.videos &&
                                        Array.isArray(
                                            data.result.response.videos,
                                        ) &&
                                        data.result.response.videos.length > 0
                                    ) {
                                        const video =
                                            data.result.response.videos[0];
                                        if (video.bytesBase64Encoded) {
                                            mediaUrl = `data:video/mp4;base64,${video.bytesBase64Encoded}`;
                                            console.log(
                                                "Found Veo video with base64 data",
                                            );
                                        } else if (video.gcsUri) {
                                            mediaUrl = video.gcsUri.replace(
                                                "gs://",
                                                "https://storage.googleapis.com/",
                                            );
                                            console.log(
                                                "Found Veo video with GCS URI:",
                                                mediaUrl,
                                            );
                                        }
                                    }
                                    // Fallback: check if data.result.output is a string that needs parsing
                                    else if (
                                        data?.result?.output &&
                                        typeof data.result.output === "string"
                                    ) {
                                        try {
                                            const parsed = JSON.parse(
                                                data.result.output,
                                            );
                                            console.log(
                                                "Parsed Veo response:",
                                                parsed,
                                            );

                                            // Try different possible response structures
                                            let videoUrl = null;

                                            // Structure 1: parsed.response.videos[0].gcsUri
                                            if (
                                                parsed.response?.videos &&
                                                Array.isArray(
                                                    parsed.response.videos,
                                                ) &&
                                                parsed.response.videos.length >
                                                    0
                                            ) {
                                                const video =
                                                    parsed.response.videos[0];
                                                if (video.gcsUri) {
                                                    videoUrl =
                                                        video.gcsUri.replace(
                                                            "gs://",
                                                            "https://storage.googleapis.com/",
                                                        );
                                                } else if (
                                                    video.bytesBase64Encoded
                                                ) {
                                                    videoUrl = `data:video/mp4;base64,${video.bytesBase64Encoded}`;
                                                }
                                            }

                                            // Structure 2: parsed.videos[0].gcsUri (no response wrapper)
                                            if (
                                                !videoUrl &&
                                                parsed.videos &&
                                                Array.isArray(parsed.videos) &&
                                                parsed.videos.length > 0
                                            ) {
                                                const video = parsed.videos[0];
                                                if (video.gcsUri) {
                                                    videoUrl =
                                                        video.gcsUri.replace(
                                                            "gs://",
                                                            "https://storage.googleapis.com/",
                                                        );
                                                } else if (
                                                    video.bytesBase64Encoded
                                                ) {
                                                    videoUrl = `data:video/mp4;base64,${video.bytesBase64Encoded}`;
                                                }
                                            }

                                            // Structure 3: direct gcsUri in parsed
                                            if (!videoUrl && parsed.gcsUri) {
                                                videoUrl =
                                                    parsed.gcsUri.replace(
                                                        "gs://",
                                                        "https://storage.googleapis.com/",
                                                    );
                                            }

                                            // Structure 4: direct URL in parsed
                                            if (!videoUrl && parsed.url) {
                                                videoUrl = parsed.url;
                                            }

                                            if (videoUrl) {
                                                mediaUrl = videoUrl;
                                                console.log(
                                                    "Found Veo video URL:",
                                                    videoUrl,
                                                );
                                            } else {
                                                console.log(
                                                    "No video URL found in Veo response",
                                                );
                                            }
                                        } catch (e) {
                                            console.error(
                                                "Error parsing Veo video response:",
                                                e,
                                            );
                                        }
                                    } else {
                                        console.log(
                                            "No output string found in Veo response",
                                        );
                                    }
                                } else {
                                    // Standard image/video response structure
                                    mediaUrl = Array.isArray(
                                        data?.result?.output,
                                    )
                                        ? data?.result?.output?.[0]
                                        : data?.result?.output;
                                }

                                // Upload to cloud storage if we have a valid URL
                                let cloudUrls = null;
                                if (mediaUrl && typeof mediaUrl === "string") {
                                    try {
                                        cloudUrls =
                                            await uploadMediaToCloud(mediaUrl);
                                    } catch (error) {
                                        console.error(
                                            "Failed to upload media to cloud:",
                                            error,
                                        );
                                        // Continue without cloud URLs if upload fails
                                    }
                                }

                                newImages[imageIndex] = {
                                    ...newImages[imageIndex],
                                    ...data,
                                    url:
                                        cloudUrls?.azureUrl ||
                                        (mediaUrl &&
                                        !mediaUrl.startsWith("data:")
                                            ? mediaUrl
                                            : undefined),
                                    azureUrl: cloudUrls?.azureUrl,
                                    gcsUrl: cloudUrls?.gcsUrl,
                                    regenerating: false,
                                };
                            }
                            setImages(newImages);

                            // Clean data before storing in localStorage to avoid quota issues
                            try {
                                const cleanImages = newImages.map(
                                    cleanMediaDataForStorage,
                                );
                                localStorage.setItem(
                                    "generated-media",
                                    JSON.stringify(cleanImages),
                                );
                            } catch (error) {
                                console.warn(
                                    "Failed to save to localStorage, data may be too large:",
                                    error,
                                );
                                // Try to save a minimal version with just essential data
                                try {
                                    const minimalImages = newImages.map(
                                        (img) => ({
                                            cortexRequestId:
                                                img.cortexRequestId,
                                            prompt: img.prompt,
                                            created: img.created,
                                            inputImageUrl: img.inputImageUrl,
                                            type: img.type,
                                            model: img.model,
                                            azureUrl: img.azureUrl,
                                            gcsUrl: img.gcsUrl,
                                            url:
                                                img.azureUrl ||
                                                (img.url &&
                                                !img.url.startsWith("data:")
                                                    ? img.url
                                                    : undefined),
                                            regenerating: img.regenerating,
                                            result: img.result?.error
                                                ? img.result
                                                : undefined,
                                        }),
                                    );
                                    localStorage.setItem(
                                        "generated-media",
                                        JSON.stringify(minimalImages),
                                    );
                                } catch (minimalError) {
                                    console.error(
                                        "Failed to save even minimal data to localStorage:",
                                        minimalError,
                                    );
                                }
                            }
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

                            // Clean data before storing in localStorage
                            try {
                                const cleanImages = newImages.map(
                                    cleanMediaDataForStorage,
                                );
                                localStorage.setItem(
                                    "generated-media",
                                    JSON.stringify(cleanImages),
                                );
                            } catch (error) {
                                console.warn(
                                    "Failed to save to localStorage:",
                                    error,
                                );
                            }

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
        generateMedia,
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
                        className="flex flex-col gap-2"
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
                                    generateMedia(prompt);
                                }
                            } else {
                                generateMedia(prompt);
                            }
                        }}
                    >
                        <textarea
                            className="lb-input flex-grow min-h-[2.5rem] max-h-32 resize-y"
                            placeholder={
                                selectedImages.size > 0
                                    ? t(
                                          "Describe what you want to do with the selected images",
                                      )
                                    : t("Describe what you want to generate")
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
                                            generateMedia(prompt);
                                        }
                                    } else {
                                        generateMedia(prompt);
                                    }
                                }
                            }}
                            ref={promptRef}
                        />

                        <div className="flex gap-2 items-center media-toolbar-row">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="lb-input flex items-center justify-center settings-btn-square text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                            onClick={() =>
                                                setShowSettings(true)
                                            }
                                        >
                                            <FaCog />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Generation Settings")}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <select
                                className="lb-input flex-1 media-toolbar-dropdown"
                                value={selectedModel}
                                onChange={(e) => {
                                    const newSelectedModel = e.target.value;
                                    const modelSettings = getModelSettings(
                                        settings,
                                        newSelectedModel,
                                    );

                                    setSelectedModel(newSelectedModel);

                                    if (modelSettings.type === "image") {
                                        setOutputType("image");
                                        setQuality(
                                            modelSettings.quality || "draft",
                                        );
                                    } else {
                                        setOutputType("video");
                                    }
                                }}
                            >
                                {Object.keys(settings.models || {}).map(
                                    (modelName) => {
                                        const modelSettings =
                                            settings.models[modelName];
                                        const displayName =
                                            {
                                                "replicate-flux-1-schnell":
                                                    "Flux Draft",
                                                "replicate-flux-11-pro":
                                                    "Flux Pro",
                                                "replicate-flux-kontext-max":
                                                    "Flux Kontext Max",
                                                "replicate-multi-image-kontext-max":
                                                    "Multi-Image Kontext Max",
                                                "veo-2.0-generate": "Veo 2.0",
                                                "veo-3.0-generate": "Veo 3.0",
                                                "replicate-seedance-1-pro":
                                                    "Seedance 1.0",
                                            }[modelName] || modelName;

                                        return (
                                            <option
                                                key={modelName}
                                                value={modelName}
                                            >
                                                {modelSettings?.type === "image"
                                                    ? "Image"
                                                    : "Video"}{" "}
                                                ({displayName})
                                            </option>
                                        );
                                    },
                                )}
                            </select>

                            <LoadingButton
                                className="lb-primary"
                                style={{ whiteSpace: "nowrap" }}
                                loading={loading}
                                text={t("Generating...")}
                                type="submit"
                                disabled={
                                    !prompt.trim() ||
                                    (isModifyMode && selectedImages.size === 0)
                                }
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

            <div className="media-grid">{mediaTiles}</div>
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
                            {t("Delete All Media?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete all media? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction autoFocus onClick={handleDeleteAll}>
                            {t("Delete All Media")}
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
                            {t("Delete Selected Media?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete the selected media? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={handleDeleteSelected}
                        >
                            {t("Delete Selected Media")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <SettingsDialog
                show={showSettings}
                settings={settings}
                setSettings={setSettings}
                onHide={() => setShowSettings(false)}
            />
        </div>
    );
}

function SettingsDialog({ show, settings, setSettings, onHide }) {
    const { t } = useTranslation();
    const [localSettings, setLocalSettings] = useState(settings);
    const [selectedModel, setSelectedModel] = useState(
        "replicate-flux-1-schnell",
    );

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const handleSave = () => {
        setSettings(localSettings);
        onHide();
    };

    const handleCancel = () => {
        setLocalSettings(settings);
        onHide();
    };

    const updateModelSetting = (modelName, key, value) => {
        setLocalSettings((prev) => ({
            ...prev,
            models: {
                ...prev.models,
                [modelName]: {
                    ...prev.models[modelName],
                    [key]: value,
                },
            },
        }));
    };

    const getModelDisplayName = (modelName) => {
        const names = {
            "replicate-flux-1-schnell": "Flux Draft",
            "replicate-flux-11-pro": "Flux Pro",
            "replicate-flux-kontext-max": "Flux Kontext Max",
            "replicate-multi-image-kontext-max": "Multi-Image Kontext Max",
            "veo-2.0-generate": "Veo 2.0",
            "veo-3.0-generate": "Veo 3.0",
            "replicate-seedance-1-pro": "Seedance 1.0",
        };
        return names[modelName] || modelName;
    };

    const getModelType = (modelName) => {
        return localSettings.models[modelName]?.type || "image";
    };

    const getAvailableAspectRatios = (modelName) => {
        const modelType = getModelType(modelName);
        if (modelType === "video") {
            if (modelName.startsWith("veo")) {
                return [
                    { value: "16:9", label: "16:9" },
                    { value: "9:16", label: "9:16" },
                ];
            } else {
                return [
                    { value: "16:9", label: "16:9" },
                    { value: "4:3", label: "4:3" },
                    { value: "9:16", label: "9:16" },
                    { value: "1:1", label: "1:1" },
                    { value: "3:4", label: "3:4" },
                    { value: "21:9", label: "21:9" },
                    { value: "9:21", label: "9:21" },
                ];
            }
        } else {
            return [
                { value: "1:1", label: "1:1" },
                { value: "16:9", label: "16:9" },
                { value: "21:9", label: "21:9" },
                { value: "3:2", label: "3:2" },
                { value: "2:3", label: "2:3" },
                { value: "4:5", label: "4:5" },
                { value: "5:4", label: "5:4" },
                { value: "3:4", label: "3:4" },
                { value: "4:3", label: "4:3" },
                { value: "9:16", label: "9:16" },
                { value: "9:21", label: "9:21" },
                { value: "match_input_image", label: "Match Input Image" },
            ];
        }
    };

    const getAvailableDurations = (modelName) => {
        if (modelName === "veo-3.0-generate") {
            return [{ value: 8, label: "8s" }];
        } else if (modelName === "veo-2.0-generate") {
            return [
                { value: 5, label: "5s" },
                { value: 6, label: "6s" },
                { value: 7, label: "7s" },
                { value: 8, label: "8s" },
            ];
        } else if (modelName === "replicate-seedance-1-pro") {
            return [
                { value: 5, label: "5s" },
                { value: 10, label: "10s" },
            ];
        }
        return [];
    };

    const modelNames = Object.keys(localSettings.models || {});
    const currentModelSettings = localSettings.models?.[selectedModel] || {};

    return (
        <Modal
            show={show}
            onHide={handleCancel}
            title={t("Generation Settings")}
        >
            <div className="space-y-6">
                {/* Model Selection */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        {t("Select Model")}
                    </label>
                    <select
                        className="lb-input w-full"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                    >
                        {modelNames.map((modelName) => (
                            <option key={modelName} value={modelName}>
                                {getModelDisplayName(modelName)}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Model Settings */}
                <div>
                    <h3 className="text-lg font-semibold mb-3">
                        {getModelDisplayName(selectedModel)} {t("Settings")}
                    </h3>

                    <div className="space-y-3">
                        {/* Aspect Ratio */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                {t("Aspect Ratio")}
                            </label>
                            <select
                                className="lb-input w-full"
                                value={
                                    currentModelSettings.aspectRatio || "1:1"
                                }
                                onChange={(e) =>
                                    updateModelSetting(
                                        selectedModel,
                                        "aspectRatio",
                                        e.target.value,
                                    )
                                }
                            >
                                {getAvailableAspectRatios(selectedModel).map(
                                    (ratio) => (
                                        <option
                                            key={ratio.value}
                                            value={ratio.value}
                                        >
                                            {ratio.label}
                                        </option>
                                    ),
                                )}
                            </select>
                        </div>

                        {/* Duration (for video models) */}
                        {getModelType(selectedModel) === "video" &&
                            getAvailableDurations(selectedModel).length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        {t("Duration (seconds)")}
                                    </label>
                                    <select
                                        className="lb-input w-full"
                                        value={
                                            currentModelSettings.duration || 5
                                        }
                                        onChange={(e) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "duration",
                                                parseInt(e.target.value),
                                            )
                                        }
                                    >
                                        {getAvailableDurations(
                                            selectedModel,
                                        ).map((duration) => (
                                            <option
                                                key={duration.value}
                                                value={duration.value}
                                            >
                                                {duration.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                        {/* Resolution (for non-Veo video models) */}
                        {getModelType(selectedModel) === "video" &&
                            !selectedModel.startsWith("veo") && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        {t("Resolution")}
                                    </label>
                                    <select
                                        className="lb-input w-full"
                                        value={
                                            currentModelSettings.resolution ||
                                            "1080p"
                                        }
                                        onChange={(e) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "resolution",
                                                e.target.value,
                                            )
                                        }
                                    >
                                        <option value="480p">480p</option>
                                        <option value="1080p">1080p</option>
                                    </select>
                                </div>
                            )}

                        {/* Generate Audio (for Veo 3.0) */}
                        {selectedModel === "veo-3.0-generate" && (
                            <div>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        className="lb-checkbox"
                                        checked={
                                            currentModelSettings.generateAudio ||
                                            false
                                        }
                                        onChange={(e) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "generateAudio",
                                                e.target.checked,
                                            )
                                        }
                                    />
                                    <span className="text-sm font-medium">
                                        {t("Generate Audio")}
                                    </span>
                                </label>
                            </div>
                        )}

                        {/* Camera Fixed (for Seedance) */}
                        {selectedModel === "replicate-seedance-1-pro" && (
                            <div>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        className="lb-checkbox"
                                        checked={
                                            currentModelSettings.cameraFixed ||
                                            false
                                        }
                                        onChange={(e) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "cameraFixed",
                                                e.target.checked,
                                            )
                                        }
                                    />
                                    <span className="text-sm font-medium">
                                        {t("Camera Fixed")}
                                    </span>
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
                <button className="lb-secondary" onClick={handleCancel}>
                    {t("Cancel")}
                </button>
                <button className="lb-primary" onClick={handleSave}>
                    {t("Save Settings")}
                </button>
            </div>
        </Modal>
    );
}

function Progress({
    requestId,
    prompt,
    quality,
    onDataReceived,
    inputImageUrl,
    outputType,
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
                mode={outputType === "video" ? "spinner" : "progress"}
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
                                    message: `Failed to generate ${outputType || "media"}`,
                                },
                            },
                            prompt,
                        });
                    }
                }}
                autoDuration={
                    outputType === "video"
                        ? null
                        : !inputImageUrl && quality === "draft"
                          ? 1000
                          : 10000
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
    const url = image?.azureUrl || image?.url;
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
        <div className="media-tile">
            {/* Selection checkbox - always visible */}
            <div
                className={`selection-checkbox ${isSelected ? "selected" : ""}`}
                onClick={handleSelection}
            >
                <FaCheck
                    className={`text-sm ${isSelected ? "opacity-100" : "opacity-0"}`}
                />
            </div>

            <div className="media-wrapper" onClick={onClick}>
                {regenerating ? (
                    <div className="h-full bg-gray-50 p-4 text-sm flex items-center justify-center">
                        <ProgressComponent />
                    </div>
                ) : !expired && url && !loadError ? (
                    image.type === "video" ? (
                        <video
                            src={url}
                            className="w-full h-full object-cover object-center"
                            controls
                            onError={() => setLoadError(true)}
                            onLoad={() => setLoadError(false)}
                        />
                    ) : (
                        <ChatImage
                            src={url}
                            alt={prompt}
                            onError={() => setLoadError(true)}
                            onLoad={() => setLoadError(false)}
                            className="w-full h-full object-cover object-center"
                        />
                    )
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

            <div className="media-prompt" title={prompt}>
                {prompt}
            </div>

            <div className="media-actions">
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
                                    `Are you sure you want to delete this ${image.type === "video" ? "video" : "image"}?`,
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
                    outputType={image?.type || "image"}
                />
            </div>
        );
    }

    function BadRequestError() {
        return (
            <div className="text-center">
                <div>
                    {t(
                        `${image.type === "video" ? "Video" : "Image"} blocked by safety system.`,
                    )}
                </div>
            </div>
        );
    }

    function OtherError() {
        return (
            <div className="text-center flex flex-col items-center justify-center h-full">
                <div>{`${t(`${image.type === "video" ? "Video" : "Image"} Error: `)} ${message}`}</div>
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
                    {t(
                        `${image.type === "video" ? "Video" : "Image"} expired or not available.`,
                    )}
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
                    {t(
                        `Generation completed but no ${image.type === "video" ? "video" : "image"} was produced.`,
                    )}
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
        <Modal
            show={show}
            onHide={onHide}
            title={t(`Generated ${image?.type || "image"}`)}
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                <div className="sm:basis-9/12">
                    {image?.type === "video" ? (
                        <video
                            className="rounded-md w-full"
                            src={image?.azureUrl || image?.url}
                            controls
                        />
                    ) : (
                        <ChatImage
                            className="rounded-md w-full"
                            src={image?.azureUrl || image?.url}
                            alt={image?.prompt}
                        />
                    )}
                </div>
                <div className="sm:basis-3/12 flex flex-col max-h-[400px]">
                    <div className="sm:text-sm">
                        <ImageInfo data={image} type={image?.type || "image"} />
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

function ImageInfo({ data, type }) {
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
                        {t("Azure URL")}
                    </div>
                </div>
                <div style={{ lineBreak: "anywhere" }}>
                    {data?.azureUrl ? (
                        <a
                            href={data.azureUrl}
                            target="_blank"
                            className="text-sky-500"
                            rel="noreferrer"
                        >
                            {t("Azure Link")}
                        </a>
                    ) : (
                        <span className="text-gray-400">
                            {t("Not uploaded")}
                        </span>
                    )}
                </div>
            </div>
            {data?.gcsUrl && (
                <div className="mb-2">
                    <div>
                        <div className="font-semibold text-gray-500">
                            {t("GCS URL")}
                        </div>
                    </div>
                    <div style={{ lineBreak: "anywhere" }}>
                        <a
                            href={data.gcsUrl}
                            target="_blank"
                            className="text-sky-500"
                            rel="noreferrer"
                        >
                            {t("GCS Link")}
                        </a>
                    </div>
                </div>
            )}
            {!data?.azureUrl && (
                <div className="mb-2">
                    <div>
                        <div className="font-semibold text-gray-500">
                            {t("Original URL")}
                        </div>
                    </div>
                    <div style={{ lineBreak: "anywhere" }}>
                        {data?.url ? (
                            <a
                                href={data.url}
                                target="_blank"
                                className="text-sky-500"
                                rel="noreferrer"
                            >
                                {t("Original Link")}
                            </a>
                        ) : (
                            t("URL not found")
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MediaPage;
