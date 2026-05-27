import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { UploadIcon, Loader2Icon } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { AuthContext, ServerContext } from "../../../src/App";
import config from "../../../config";
import { uploadFileToMediaHelper } from "../../../src/utils/fileUploadUtils";
import {
    createChatStorageTarget,
    createUserGlobalStorageTarget,
    createWorkspacePrivateStorageTarget,
} from "../../../src/utils/storageTargets";

// Shared FileUploadDialog component
export default function FileUploadDialog({
    isOpen,
    onClose,
    onFileUpload,
    uploadEndpoint,
    workspaceId = null,
    chatId = null,
    contextId: contextIdProp = null,
    storageTarget = null,
    title = "Upload Files",
    description = "Upload files to include in your workspace. Supported formats include images, documents, and media files.",
}) {
    const { t } = useTranslation();
    const isRtl = i18next.language === "ar";
    const { serverUrl } = useContext(ServerContext);
    const { user } = useContext(AuthContext);

    // Determine contextId based on file type:
    // - If contextId prop is provided, use it directly (caller knows best)
    // - Otherwise use user.contextId for all user-scoped operations
    // Workspace artifact uploads are routed via uploadEndpoint, not contextId.
    let contextId;
    if (contextIdProp) {
        contextId = contextIdProp;
    } else {
        contextId = user?.contextId || null;
    }
    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [totalFiles, setTotalFiles] = useState(0);
    const [currentFileName, setCurrentFileName] = useState("");

    const uploadOneViaEndpoint = (file) =>
        new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append("file", file);

            const xhr = new XMLHttpRequest();
            xhr.open("POST", uploadEndpoint, true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    setUploadProgress(
                        Math.round((event.loaded * 100) / event.total),
                    );
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        reject(
                            new Error(
                                t("File upload failed: Invalid response"),
                            ),
                        );
                    }
                } else {
                    let message = `${t("File upload failed, response:")} ${xhr.statusText}`;
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        if (errorData.error) message = errorData.error;
                    } catch {
                        // keep default message
                    }
                    reject(new Error(message));
                }
            };

            xhr.onerror = () => reject(new Error(t("File upload failed")));
            xhr.send(formData);
        });

    const uploadOneViaMediaHelper = async (file) => {
        const directUploadTarget =
            storageTarget ||
            (workspaceId && contextId
                ? createWorkspacePrivateStorageTarget(contextId, workspaceId)
                : chatId && contextId
                  ? createChatStorageTarget(contextId, chatId)
                  : contextId
                    ? createUserGlobalStorageTarget(contextId)
                    : null);
        const data = await uploadFileToMediaHelper(file, {
            storageTarget: directUploadTarget,
            contextId,
            checkHash: false,
            onProgress: setUploadProgress,
            serverUrl: config.endpoints.mediaHelper(serverUrl),
        });
        return {
            url: data.url,
            displayFilename: data.displayFilename,
            converted: data.converted,
            hash: data.hash,
        };
    };

    const handleFileUpload = async (event) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        setFileUploading(true);
        setFileUploadError(null);
        setUploadProgress(0);
        setTotalFiles(files.length);

        const errors = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setCurrentFileIndex(i + 1);
            setCurrentFileName(file.name);
            setUploadProgress(0);

            try {
                const data = uploadEndpoint
                    ? await uploadOneViaEndpoint(file)
                    : await uploadOneViaMediaHelper(file);
                onFileUpload(data);
            } catch (error) {
                console.error("File upload error:", error);
                errors.push(
                    `${file.name}: ${error.message || t("File upload failed. Please try again.")}`,
                );
            }
        }

        setFileUploading(false);
        setCurrentFileIndex(0);
        setTotalFiles(0);
        setCurrentFileName("");

        if (errors.length > 0) {
            setFileUploadError({ message: errors.join("\n") });
        } else {
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader className={isRtl ? "text-right" : ""}>
                    <DialogTitle>{t(title)}</DialogTitle>
                    <DialogDescription>{t(description)}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {fileUploading ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-8">
                            <div
                                className={`flex items-center gap-2 text-sm text-gray-500 ${isRtl ? "flex-row-reverse" : ""}`}
                            >
                                <Loader2Icon className="w-4 h-4 animate-spin" />
                                <span>
                                    {totalFiles > 1
                                        ? `${t("Uploading file")} ${currentFileIndex} ${t("of")} ${totalFiles}: ${currentFileName} (${Math.round(uploadProgress)}%)`
                                        : `${t("Uploading file...")} ${Math.round(uploadProgress)}%`}
                                </span>
                            </div>
                            {/* Progress bar */}
                            <div
                                className="w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
                                dir={isRtl ? "rtl" : "ltr"}
                            >
                                <div
                                    className="h-full bg-sky-500 dark:bg-sky-400 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-center w-full">
                            <div className="flex flex-col gap-4">
                                <div
                                    className={`border-2 border-dashed border-gray-300 rounded-lg p-8 w-full max-w-xl hover:border-primary-500 transition-colors ${isRtl ? "text-right" : ""}`}
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
                                        handleFileUpload({
                                            target: {
                                                files: e.dataTransfer.files,
                                            },
                                        });
                                    }}
                                >
                                    <div
                                        className={`text-center max-w-96 ${isRtl ? "text-right" : ""}`}
                                    >
                                        <label
                                            className={`lb-outline-secondary text-sm flex gap-2 items-center cursor-pointer justify-center w-64 mx-auto mb-3 ${isRtl ? "flex-row-reverse" : ""}`}
                                        >
                                            <input
                                                type="file"
                                                className="hidden"
                                                multiple
                                                onChange={handleFileUpload}
                                                disabled={fileUploading}
                                            />
                                            <UploadIcon className="w-4 h-4" />
                                            {t("Choose files")}
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
                                    <p
                                        className={`text-red-600 dark:text-red-400 text-sm mt-2 whitespace-pre-line ${isRtl ? "text-right" : "text-center"}`}
                                    >
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
