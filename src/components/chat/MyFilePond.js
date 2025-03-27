import axios from "../../../app/utils/axios-client";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import mime from "mime-types";
import { FilePond, registerPlugin } from "react-filepond";
import { AiOutlineClose } from "react-icons/ai";
import { FaLink } from "react-icons/fa";

// Import FilePond styles
import "filepond/dist/filepond.min.css";
import "./MyFilePond.css";
// Import the Image EXIF Orientation and Image Preview plugins
// Note: These need to be installed separately
// `npm i filepond-plugin-image-preview filepond-plugin-image-exif-orientation --save`
import FilePondPluginImageExifOrientation from "filepond-plugin-image-exif-orientation";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    hashMediaFile,
    DOC_MIME_TYPES,
    ACCEPTED_FILE_TYPES,
    isMediaUrl,
    getFilename,
    getVideoDuration,
} from "../../utils/mediaUtils";
import { isYoutubeUrl } from "../../utils/urlUtils";

// Global upload speed tracking
let lastBytesPerMs = null; // bytes per millisecond from last successful upload including cloud processing

// Register the plugins
registerPlugin(
    FilePondPluginImageExifOrientation,
    FilePondPluginImagePreview,
    FilePondPluginFileValidateType,
);

function RemoteUrlInputUI({
    inputUrl,
    setInputUrl,
    handleAddFile,
    setShowInputUI,
    showInputUI,
}) {
    const inputRef = useRef();
    const { t } = useTranslation();

    useEffect(() => {
        if (showInputUI) {
            // when showInputUI is true, focus on the input field
            inputRef.current.focus();
        }
    }, [showInputUI]);

    if (!showInputUI) {
        return (
            <div className="flex rounded p-1 my-2 dark:border-none ">
                <button
                    className="flex items-center justify-center"
                    onClick={() => setShowInputUI(!showInputUI)}
                >
                    <span className="inline-block px-1">
                        <FaLink />
                    </span>
                    <span className="underline px-1">
                        {t("Add File from Url")}
                    </span>
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center rounded-md flex-grow">
            <button
                className="font-bold py-1 px-1 rounded-full mx-1 border-gray-300"
                onClick={() => setShowInputUI(false)}
            >
                <AiOutlineClose />
            </button>
            <input
                className="lb-input flex-grow flex focus:outline-none mx-2 p-2 border-2 border-gray-300 rounded-md shadow-lg text-xs"
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder={`${t("e.g.")} https://www.youtube.com/watch?v=videoId`}
                ref={inputRef}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault(); // prevent the default action (form submission, etc.)
                        if (!inputUrl) return;
                        setShowInputUI(false);
                        handleAddFile();
                    }
                }}
            />
            <button
                className="font-bold py-1 px-1 rounded-full mx-1 border-gray-300"
                onClick={() => {
                    if (!inputUrl) return;
                    setShowInputUI(false);
                    handleAddFile();
                }}
            >
                {t("Add")}
            </button>
        </div>
    );
}

// Our app
function MyFilePond({ addUrl, files, setFiles, setIsUploadingMedia }) {
    const pondRef = useRef(null);
    const serverUrl = "/media-helper?useGoogle=true";
    const [inputUrl, setInputUrl] = useState("");
    const [showInputUI, setShowInputUI] = useState(false);
    const { t } = useTranslation();

    const [processingLabel, setProcessingLabel] = useState(
        t("Checking file..."),
    );
    const labelIdle = `${t("Drag & Drop your files or")} <span class="filepond--label-action">${t("Browse")}</span>`;

    const handleAddFile = () => {
        // Validate URL format
        try {
            new URL(inputUrl);
        } catch (err) {
            alert(t("Please enter a valid URL"));
            return;
        }

        // If it's a YouTube URL, simulate an instant upload through FilePond's API
        if (isYoutubeUrl(inputUrl)) {
            const youtubeResponse = {
                url: inputUrl,
                gcs: inputUrl,
                type: "video/youtube", // custom type used internally
                filename: getFilename(inputUrl),
                payload: JSON.stringify([
                    JSON.stringify({
                        type: "image_url",
                        url: inputUrl,
                        gcs: inputUrl,
                    }),
                ]),
            };

            // Pass the response to your existing chat logic
            addUrl(youtubeResponse);

            // Create a pre-loaded file object
            setFiles((prevFiles) => [
                ...prevFiles,
                {
                    source: youtubeResponse,
                    options: {
                        type: "limbo",
                        file: {
                            name: getFilename(inputUrl),
                            type: "video/youtube",
                            size: 0,
                        },
                    },
                },
            ]);

            // Clear the URL input
            setInputUrl("");
            return;
        }

        // For non-YouTube URLs, continue with the existing logic
        setIsUploadingMedia(true);
        setFiles([...files, { source: inputUrl }]);
        setInputUrl("");
    };

    // Add FilePond labels in current language
    const labels = {
        labelIdle: `${t("Drag & Drop your files or")} <span class="filepond--label-action">${t("Browse")}</span>`,
        labelFileProcessing: processingLabel,
        labelFileProcessingComplete: t("Upload complete"),
        labelFileProcessingAborted: t("Upload cancelled"),
        labelFileProcessingError: (error) =>
            t(error?.body || "Error during upload"),
        labelFileLoadError: (error) => t(error?.body || "Invalid URL"),
        labelFileLoading: t("Checking URL..."),
        labelFileProcessingRevertError: t("Error during removal"),
        labelTapToCancel: t("tap to cancel"),
        labelTapToRetry: t("tap to retry"),
        labelTapToUndo: t("tap to undo"),
        labelButtonRemoveItem: t("Remove"),
        labelButtonAbortItemLoad: t("Cancel"),
        labelButtonRetryItemLoad: t("Retry"),
        labelButtonAbortItemProcessing: t("Cancel"),
        labelButtonUndoItemProcessing: t("Undo"),
        labelButtonRetryItemProcessing: t("Retry"),
        labelButtonProcessItem: t("Upload"),
        labelFileTypeNotAllowed: t("Invalid file type"),
        fileValidateTypeLabelExpectedTypes: t(
            "Please upload a document, image, video, or audio file",
        ),
    };

    return (
        <>
            <div className="flex items-center justify-center pb-1 mt-0 h-12">
                <RemoteUrlInputUI
                    inputUrl={inputUrl}
                    setInputUrl={setInputUrl}
                    handleAddFile={handleAddFile}
                    showInputUI={showInputUI}
                    setShowInputUI={setShowInputUI}
                />
            </div>
            <div className="flex mt-0 mb-0">
                <div className="flex-grow w-full">
                    <FilePond
                        ref={pondRef}
                        files={files}
                        onupdatefiles={setFiles}
                        allowFileTypeValidation={true}
                        {...labels}
                        acceptedFileTypes={ACCEPTED_FILE_TYPES}
                        labelFileTypeNotAllowed={t("Invalid file type")}
                        fileValidateTypeLabelExpectedTypes={t(
                            "Please upload a document, image, video, or audio file",
                        )}
                        labelFileProcessingError={(error) => {
                            return t(error?.body || "Error during upload");
                        }}
                        allowMultiple={true}
                        // maxFiles={3}
                        server={{
                            url: serverUrl,
                            fetch: async (
                                fileUrl,
                                load,
                                error,
                                progress,
                                abort,
                                headers,
                            ) => {
                                // For YouTube URLs, immediately load without fetching
                                if (isYoutubeUrl(fileUrl)) {
                                    const response = {
                                        url: fileUrl,
                                        gcs: fileUrl,
                                        type: "video/youtube",
                                        filename: getFilename(fileUrl),
                                    };
                                    load(response);
                                    return;
                                }
                                try {
                                    const response = await axios.get(
                                        `${serverUrl}&fetch=${fileUrl}`,
                                    );
                                    if (response.data && response.data.url) {
                                        const { url } = response.data;
                                        const filename = url
                                            .split("/")
                                            .pop()
                                            .split("?")[0];
                                        const type = mime.lookup(filename);
                                        load(
                                            new Blob([url], {
                                                type,
                                            }),
                                        );
                                        addUrl(response.data);
                                        setIsUploadingMedia(false);
                                        return;
                                    }
                                } catch (err) {
                                    console.error(err);
                                    error("Could not load file");
                                    setIsUploadingMedia(false);
                                }
                            },
                            process: async (
                                fieldName,
                                file,
                                metadata,
                                load,
                                error,
                                progress,
                                abort,
                            ) => {
                                // Handle YouTube URLs differently
                                if (
                                    file.type === "video/youtube" ||
                                    (metadata &&
                                        metadata.type === "video/youtube")
                                ) {
                                    const response = {
                                        url: file.name || file,
                                        gcs: file.name || file,
                                        type: "video/youtube",
                                        filename: getFilename(
                                            file.name || file,
                                        ),
                                    };
                                    progress(true, 100, 100);
                                    load(response);
                                    return;
                                }

                                setProcessingLabel(t("Checking file..."));
                                setIsUploadingMedia(true);

                                const isRemote = !(file instanceof File);
                                if (isRemote) {
                                    load(file.source);
                                    return;
                                }

                                // File validation checks
                                if (file.type === "application/pdf") {
                                    const MAX_PDF_SIZE = 50 * 1024 * 1024;
                                    if (file.size > MAX_PDF_SIZE) {
                                        error(
                                            "PDF files must be less than 50MB",
                                        );
                                        return;
                                    }
                                }

                                // Video duration check
                                if (file.type.startsWith("video/")) {
                                    try {
                                        const duration =
                                            await getVideoDuration(file);
                                        if (duration > 3600) {
                                            error(
                                                "Video must be less than 60 minutes long",
                                            );
                                            return;
                                        }
                                    } catch (err) {
                                        console.error(
                                            "Error checking video duration:",
                                            err,
                                        );
                                        error(
                                            "Could not verify video duration",
                                        );
                                        return;
                                    }
                                }

                                if (isMediaUrl(file?.name)) {
                                    setIsUploadingMedia(true);
                                }

                                // Start showing upload progress
                                progress(true, 0, file.size);
                                const fileHash = await hashMediaFile(file);

                                // Check if file exists
                                try {
                                    const response = await axios.get(
                                        `${serverUrl}&hash=${fileHash}&checkHash=true`,
                                    );
                                    if (
                                        response.status === 200 &&
                                        response.data?.url
                                    ) {
                                        if (isMediaUrl(file?.name)) {
                                            const hasAzureUrl =
                                                response.data.url &&
                                                response.data.url.includes(
                                                    "blob.core.windows.net",
                                                );
                                            const hasGcsUrl = response.data.gcs;

                                            if (!hasAzureUrl || !hasGcsUrl) {
                                                error({
                                                    body: "Media file upload failed: Missing required storage URLs",
                                                    type: "error",
                                                });
                                                return;
                                            }
                                        }
                                        progress(true, file.size, file.size);
                                        load(response.data);
                                        addUrl(response.data);
                                        return;
                                    }
                                } catch (err) {
                                    if (err.response?.status !== 404) {
                                        console.error(
                                            "Error checking file hash:",
                                            err,
                                        );
                                    }
                                }

                                // If we get here, we need to upload the file
                                const startTimestamp = Date.now();
                                let totalBytes = 0;
                                setProcessingLabel(t("Uploading..."));
                                const formData = new FormData();
                                formData.append("hash", fileHash);
                                formData.append(fieldName, file, file.name);
                                const request = new XMLHttpRequest();

                                let cloudProgressInterval;
                                request.upload.onprogress = (e) => {
                                    console.log(e);
                                    if (e.lengthComputable) {
                                        totalBytes = e.total; // Store total bytes for later use
                                        // First 50% is actual upload progress
                                        const uploadProgress =
                                            (e.loaded / e.total) * 50;
                                        progress(true, uploadProgress, 100);

                                        // Start cloud processing simulation when upload is at 20%
                                        if (
                                            uploadProgress >= 49 &&
                                            !cloudProgressInterval
                                        ) {
                                            let cloudProgress = 50;

                                            // Calculate expected total time based on file size and last known speed
                                            let expectedTotalTime;
                                            if (lastBytesPerMs) {
                                                // Use historical speed if available
                                                expectedTotalTime =
                                                    totalBytes / lastBytesPerMs;
                                            } else {
                                                // Fallback to actual elapsed time if no historical data
                                                expectedTotalTime =
                                                    Date.now() -
                                                    startTimestamp * 2;
                                            }

                                            // Calculate cloud processing simulation parameters
                                            const remainingSteps = 49; // remaining percentage points
                                            const cloudProcessingInterval =
                                                expectedTotalTime /
                                                remainingSteps;

                                            cloudProgressInterval = setInterval(
                                                () => {
                                                    cloudProgress += 1;
                                                    if (cloudProgress >= 99) {
                                                        clearInterval(
                                                            cloudProgressInterval,
                                                        );
                                                    }
                                                    progress(
                                                        true,
                                                        cloudProgress,
                                                        100,
                                                    );
                                                },
                                                cloudProcessingInterval,
                                            );
                                        }
                                    }
                                };

                                request.onload = function () {
                                    const totalTime =
                                        Date.now() - startTimestamp;

                                    if (cloudProgressInterval) {
                                        clearInterval(cloudProgressInterval);
                                        progress(true, 100, 100);
                                    }
                                    let responseData;
                                    try {
                                        responseData = JSON.parse(
                                            request.responseText,
                                        );
                                    } catch (err) {
                                        console.error(
                                            "Error parsing response:",
                                            err,
                                        );
                                        error({
                                            body:
                                                request.responseText ||
                                                "Error parsing server response",
                                            type: "error",
                                        });
                                        setIsUploadingMedia(false);
                                        abort();
                                        return;
                                    }

                                    if (
                                        request.status >= 200 &&
                                        request.status < 300
                                    ) {
                                        // Update global speed metric using total bytes and time including cloud processing
                                        if (totalBytes > 0) {
                                            lastBytesPerMs =
                                                totalBytes / totalTime;
                                        }

                                        // Add validation for media files requiring both Azure and GCS URLs
                                        if (isMediaUrl(file?.name)) {
                                            const hasAzureUrl =
                                                responseData.url &&
                                                responseData.url.includes(
                                                    "blob.core.windows.net",
                                                );
                                            const hasGcsUrl = responseData.gcs;

                                            if (!hasAzureUrl || !hasGcsUrl) {
                                                error({
                                                    body: "Media file upload failed: Missing required storage URLs",
                                                    type: "error",
                                                });
                                                setIsUploadingMedia(false);
                                                abort();
                                                return;
                                            }
                                        }
                                        load(responseData);
                                        addUrl(responseData);
                                        setIsUploadingMedia(false);
                                    } else {
                                        // Handle both string and object responses
                                        const errorMessage =
                                            typeof responseData === "string"
                                                ? responseData
                                                : responseData.error ||
                                                  responseData.message ||
                                                  "Error while uploading";

                                        error({
                                            body: errorMessage,
                                            type: "error",
                                        });
                                        setIsUploadingMedia(false);
                                        return false;
                                    }
                                };

                                request.onerror = () => {
                                    error({
                                        body: "Error while uploading",
                                        type: "error",
                                    });
                                    setIsUploadingMedia(false);
                                };

                                request.open(
                                    "POST",
                                    `${serverUrl}&hash=${fileHash}`,
                                );
                                request.send(formData);

                                return {
                                    abort: () => {
                                        request.abort();
                                        setIsUploadingMedia(false);
                                        abort();
                                    },
                                };
                            },
                        }}
                        onprocessfile={(error, file) => {
                            if (error) {
                                console.error("Error:", error);
                                setIsUploadingMedia(false);
                            } else {
                                const filetype = file.file.type;
                                // For document files, wait 10 seconds for indexing
                                if (DOC_MIME_TYPES.includes(filetype)) {
                                    // Remove the file from FilePond after processing
                                    setFiles((oldFiles) =>
                                        oldFiles.filter(
                                            (f) => f.serverId !== file.serverId,
                                        ),
                                    );
                                    // Wait 10 seconds for indexing
                                    setTimeout(() => {
                                        setIsUploadingMedia(false);
                                    }, 10000);
                                } else {
                                    // For non-document files, set isUploadingMedia to false immediately
                                    setIsUploadingMedia(false);
                                }
                            }
                        }}
                        name="files" /* sets the file input name, it's filepond by default */
                        labelIdle={labelIdle}
                        // allowProcess={false}
                        credits={false}
                        allowRevert={false}
                        allowReplace={false}
                    />
                </div>
            </div>
        </>
    );
}

export default MyFilePond;
