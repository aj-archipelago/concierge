import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { UploadIcon, Loader2Icon } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ServerContext } from "../../../src/App";
import config from "../../../config";
import {
    ACCEPTED_FILE_TYPES,
    hashMediaFile,
} from "../../../src/utils/mediaUtils";

// Shared FileUploadDialog component
export default function FileUploadDialog({
    isOpen,
    onClose,
    onFileUpload,
    uploadEndpoint,
    uploadMutation = null,
    workspaceId = null,
    title = "Upload Files",
    description = "Upload files to include in your workspace. Supported formats include images, documents, and media files.",
}) {
    const { t } = useTranslation();
    const { serverUrl } = useContext(ServerContext);
    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);

    const handleFileUpload = async (event) => {
        setFileUploading(true);
        setFileUploadError(null);
        setUploadProgress(0);

        const file = event.target.files[0];
        if (!file) {
            setFileUploading(false);
            return;
        }

        // Check if file type is supported
        const isSupported = ACCEPTED_FILE_TYPES.some((type) => {
            // Check MIME type
            if (file.type === type) return true;
            // Check file extension
            const fileExtension =
                "." + file.name.split(".").pop().toLowerCase();
            return type.includes(fileExtension) || type.endsWith(fileExtension);
        });

        if (!isSupported) {
            setFileUploading(false);
            setFileUploadError({
                message: t(
                    "Unsupported file type. Please upload a supported file.",
                ),
            });
            return;
        }

        try {
            // For workspace files, use React Query mutation if provided, otherwise fallback to XMLHttpRequest
            if (uploadEndpoint) {
                const formData = new FormData();
                formData.append("file", file);

                // Use React Query mutation if provided (automatic query invalidation)
                if (uploadMutation && workspaceId) {
                    try {
                        const data = await uploadMutation.mutateAsync({
                            workspaceId,
                            formData,
                        });
                        onFileUpload(data);
                        setFileUploading(false);
                        onClose();
                        return;
                    } catch (error) {
                        console.error("Upload mutation error:", error);
                        setFileUploadError({
                            message:
                                error.response?.data?.error ||
                                t("File upload failed"),
                        });
                        setFileUploading(false);
                        return;
                    }
                }

                // Fallback to XMLHttpRequest for compatibility
                const xhr = new XMLHttpRequest();
                xhr.open("POST", uploadEndpoint, true);

                // Monitor upload progress
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentage = Math.round(
                            (event.loaded * 100) / event.total,
                        );
                        setUploadProgress(percentage);
                    }
                };

                // Handle upload response
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        const data = JSON.parse(xhr.responseText);
                        onFileUpload(data);
                        setFileUploading(false);
                        onClose();
                    } else {
                        console.error(xhr.statusText);
                        const errorData = JSON.parse(xhr.responseText);
                        setFileUploadError({
                            message:
                                errorData.error ||
                                `${t("File upload failed, response:")} ${xhr.statusText}`,
                        });
                        setFileUploading(false);
                    }
                };

                // Handle upload errors
                xhr.onerror = (error) => {
                    console.error(error);
                    setFileUploadError({ message: t("File upload failed") });
                    setFileUploading(false);
                };

                // Send the file
                xhr.send(formData);
            } else {
                // Generate file hash
                const fileHash = await hashMediaFile(file);

                // Check if file already exists
                try {
                    const checkResponse = await fetch(
                        `${config.endpoints.mediaHelper(serverUrl)}?hash=${fileHash}&checkHash=true`,
                    );
                    if (checkResponse.ok) {
                        const data = await checkResponse
                            .json()
                            .catch(() => null);
                        if (data && data.url) {
                            // File already exists, use existing URL
                            onFileUpload({
                                url: data.url,
                                gcs: data.gcs,
                                originalFilename: file.name,
                                converted: data.converted,
                                hash: fileHash,
                            });
                            setFileUploading(false);
                            onClose();
                            return;
                        }
                    }
                } catch (error) {
                    console.error("Error checking file hash:", error);
                    // Continue with upload even if hash check fails
                }

                // Upload file to media helper
                const formData = new FormData();
                formData.append("hash", fileHash);
                formData.append("file", file, file.name);

                const xhr = new XMLHttpRequest();
                xhr.open(
                    "POST",
                    `${config.endpoints.mediaHelper(serverUrl)}?hash=${fileHash}`,
                    true,
                );

                // Monitor upload progress
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentage = Math.round(
                            (event.loaded * 100) / event.total,
                        );
                        setUploadProgress(percentage);
                    }
                };

                // Handle upload response
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        const data = JSON.parse(xhr.responseText);
                        const fileUrl = data.url || "";

                        onFileUpload({
                            url: fileUrl,
                            gcs: data.gcs,
                            originalFilename: file.name,
                            converted: data.converted,
                            hash: fileHash,
                        });
                        setFileUploading(false);
                        onClose();
                    } else {
                        console.error(xhr.statusText);
                        setFileUploadError({
                            message: `${t("File upload failed, response:")} ${xhr.statusText}`,
                        });
                        setFileUploading(false);
                    }
                };

                // Handle upload errors
                xhr.onerror = (error) => {
                    console.error(error);
                    setFileUploadError({ message: t("File upload failed") });
                    setFileUploading(false);
                };

                // Send the file
                xhr.send(formData);
            }
        } catch (error) {
            console.error("File upload error:", error);
            setFileUploadError({
                message: t("File upload failed. Please try again."),
            });
            setFileUploading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t(title)}</DialogTitle>
                    <DialogDescription>{t(description)}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {fileUploading ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-8">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Loader2Icon className="w-4 h-4 animate-spin" />
                                <span>
                                    {t("Uploading file...")}{" "}
                                    {Math.round(uploadProgress)}%
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-center w-full">
                            <div className="flex flex-col gap-4">
                                <div
                                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 w-full max-w-xl hover:border-primary-500 transition-colors"
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.add(
                                            "border-primary-500",
                                        );
                                    }}
                                    onDragLeave={(e) => {
                                        e.currentTarget.classList.remove(
                                            "border-primary-500",
                                        );
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove(
                                            "border-primary-500",
                                        );
                                        const file = e.dataTransfer.files[0];
                                        const event = {
                                            target: { files: [file] },
                                        };
                                        handleFileUpload(event);
                                    }}
                                >
                                    <div className="text-center max-w-96">
                                        <label className="lb-outline-secondary text-sm flex gap-2 items-center cursor-pointer justify-center w-64 mx-auto mb-3">
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept={ACCEPTED_FILE_TYPES.join(
                                                    ",",
                                                )}
                                                onChange={handleFileUpload}
                                                disabled={fileUploading}
                                            />
                                            <UploadIcon className="w-4 h-4" />
                                            {t("Choose a file")}
                                        </label>
                                        <p className="text-sm text-gray-500 mb-2">
                                            {t("or drag and drop here")}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {t("Supported formats")}:{" "}
                                            {t(
                                                "Documents, Images, Videos, Audio",
                                            )}
                                            <br />
                                            {t("Maximum file size")}:{" "}
                                            {t("50MB")}
                                        </p>
                                    </div>
                                </div>
                                {fileUploadError && (
                                    <p className="text-red-600 dark:text-red-400 text-sm mt-2 text-center">
                                        {fileUploadError.message}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
