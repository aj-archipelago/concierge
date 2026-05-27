"use client";

import React, { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Upload, Sparkles, Loader2 } from "lucide-react";
import GenerateImageDialog from "../../write/GenerateImageDialog";

/**
 * ImageTabContent - Renders image viewing/editing with isolated state
 *
 * Each instance has its own image transform state, ensuring complete isolation.
 * This is a simplified version - full image editing UI will be added incrementally.
 *
 * @param {string} tabId - Unique tab identifier
 * @param {object} initialContent - Initial content (url, title, etc.)
 * @param {boolean} isActive - Whether this tab is currently active
 * @param {function} onImageUpload - Handler for image upload
 * @param {function} onImageGenerate - Handler to open image generation dialog
 * @param {boolean} showImageDialog - Whether image generation dialog is visible
 * @param {function} onImageDialogHide - Handler to close image generation dialog
 * @param {function} onImageGenerated - Handler when image is generated
 * @param {boolean} isUploadingImage - Whether image is currently uploading
 */
export default function ImageTabContent({
    tabId,
    initialContent,
    isActive,
    onImageUpload,
    onImageGenerate,
    showImageDialog,
    onImageDialogHide,
    onImageGenerated,
    isUploadingImage,
}) {
    const { t } = useTranslation();
    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    // Initial transform values - will be made editable in future iteration
    const imageTransforms = {
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        brightness: 100,
        contrast: 100,
        saturation: 100,
    };

    const imageUrl = initialContent?.url;
    const imageTitle =
        initialContent?.title || initialContent?.filename || t("Image");

    console.log(`[ImageTabContent] Rendering tab ${tabId}`, {
        isActive,
        hasUrl: !!imageUrl,
    });

    // Handle drag and drop for image upload
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);

            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.type.startsWith("image/")) {
                    onImageUpload?.(file);
                }
            }
        },
        [onImageUpload],
    );

    const handleFileInputChange = useCallback(
        (e) => {
            const file = e.target.files?.[0];
            if (file) {
                onImageUpload?.(file);
            }
        },
        [onImageUpload],
    );

    // Simple image viewer for now - full editing UI to be added
    if (!imageUrl) {
        return (
            <>
                <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-auto h-full flex flex-col">
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="max-w-md w-full">
                            <div className="grid grid-cols-2 gap-4">
                                {/* Upload Option */}
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                    className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                                        isDragging
                                            ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                                            : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    }`}
                                >
                                    {isUploadingImage ? (
                                        <>
                                            <Loader2 className="w-8 h-8 mb-2 text-gray-400 animate-spin" />
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                {t("Uploading...")}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-8 h-8 mb-2 text-gray-400" />
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                {t("Upload")}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                                {t("Click or drag and drop")}
                                            </p>
                                        </>
                                    )}
                                </div>

                                {/* Generate Option */}
                                <div
                                    onClick={onImageGenerate}
                                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <Sparkles className="w-8 h-8 mb-2 text-gray-400" />
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {t("Generate")}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                        {t("Create with AI")}
                                    </p>
                                </div>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileInputChange}
                                disabled={isUploadingImage}
                            />
                        </div>
                    </div>
                </div>

                {/* Image Generation Dialog */}
                {showImageDialog && (
                    <GenerateImageDialog
                        onHide={onImageDialogHide}
                        onImageGenerated={onImageGenerated}
                    />
                )}
            </>
        );
    }

    return (
        <div
            className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-auto h-full flex flex-col"
            data-tab-id={tabId}
        >
            {/* Image display */}
            <div className="flex-1 flex items-center justify-center p-4">
                <div
                    style={{
                        transform: `rotate(${imageTransforms.rotation}deg) scale(${imageTransforms.scaleX}, ${imageTransforms.scaleY})`,
                        filter: `brightness(${imageTransforms.brightness}%) contrast(${imageTransforms.contrast}%) saturate(${imageTransforms.saturation}%)`,
                        transition: "transform 0.2s, filter 0.2s",
                    }}
                >
                    <img
                        src={imageUrl}
                        alt={imageTitle}
                        className="max-w-full max-h-full object-contain"
                        style={{
                            maxWidth: "100%",
                            maxHeight: "calc(100vh - 300px)",
                        }}
                    />
                </div>
            </div>

            {/* TODO: Add full image editing toolbar (rotate, crop, adjust, etc.)
                This will be extracted from Canvas.js in a future iteration */}
        </div>
    );
}
