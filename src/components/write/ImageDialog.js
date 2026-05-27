"use client";

import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Sparkles, Loader2 } from "lucide-react";
import { uploadFileToMediaHelper } from "../../utils/fileUploadUtils";
import { createArticleStorageTarget } from "../../utils/storageTargets";
import GenerateImageDialog from "./GenerateImageDialog";

export default function ImageDialog({
    show,
    onHide,
    onImageSelected,
    contextId,
}) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("upload");
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [showGenerateDialog, setShowGenerateDialog] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileUpload = async (file) => {
        if (!file) return;

        setIsUploadingImage(true);
        try {
            const result = await uploadFileToMediaHelper(file, {
                storageTarget: createArticleStorageTarget(contextId),
                checkHash: false,
            });
            if (result?.url) {
                onImageSelected(result.url);
                onHide();
            }
        } catch (error) {
            console.error("Error uploading image:", error);
        } finally {
            setIsUploadingImage(false);
        }
    };

    const handleImageGenerated = (url) => {
        onImageSelected(url);
        setShowGenerateDialog(false);
        onHide();
    };

    const handleClose = () => {
        if (!isUploadingImage) {
            onHide();
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith("image/")) {
                handleFileUpload(file);
            }
        }
    };

    return (
        <>
            <Dialog
                open={show}
                onOpenChange={(open) => {
                    if (!open && !isUploadingImage) {
                        handleClose();
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t("Insert Image")}</DialogTitle>
                    </DialogHeader>

                    <Tabs
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className="w-full"
                    >
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger
                                value="upload"
                                className="flex items-center gap-2"
                            >
                                <Upload className="w-4 h-4" />
                                {t("Upload")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="generate"
                                className="flex items-center gap-2"
                            >
                                <Sparkles className="w-4 h-4" />
                                {t("Generate")}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="upload" className="mt-4">
                            <div className="space-y-4">
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                    className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                                        isDragging
                                            ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                                            : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    }`}
                                >
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        {isUploadingImage ? (
                                            <>
                                                <Loader2 className="w-8 h-8 mb-2 text-gray-400 animate-spin" />
                                                <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                                    {t("Uploading...")}
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-8 h-8 mb-2 text-gray-400" />
                                                <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                                    <span className="font-semibold">
                                                        {t("Click to upload")}
                                                    </span>{" "}
                                                    {t("or drag and drop")}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {t(
                                                        "PNG, JPG, GIF up to 10MB",
                                                    )}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                handleFileUpload(file);
                                            }
                                        }}
                                        disabled={isUploadingImage}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="generate" className="mt-4">
                            <div className="space-y-4">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {t("Generate an image using AI")}
                                </p>
                                <button
                                    onClick={() => setShowGenerateDialog(true)}
                                    className="w-full py-3 px-4 text-sm font-medium text-white bg-sky-500 rounded-md hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                    disabled={isUploadingImage}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    {t("Generate with AI")}
                                </button>
                            </div>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            <GenerateImageDialog
                show={showGenerateDialog}
                onHide={() => setShowGenerateDialog(false)}
                onImageGenerated={handleImageGenerated}
                contextId={contextId}
                source="write_page_editor_image"
            />
        </>
    );
}
