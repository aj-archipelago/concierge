import axios from "../../../app/utils/axios-client";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import mime from "mime-types";
import { FilePond, registerPlugin } from "react-filepond";
import { X, Link } from "lucide-react";

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
    ACCEPTED_FILE_TYPES,
    RAG_MIME_TYPES,
    isSupportedFileUrl,
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
                        <Link />
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
                <X />
            </button>
            <input
                className="flex-grow flex focus:outline-none mx-2 p-2 border-2 border-gray-300 rounded-md shadow-lg text-base md:text-xs"
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
function MyFilePond({
    addUrl,
    files,
    setFiles,
    setIsUploadingMedia,
    setUrlsData,
}) {
    const pondRef = useRef(null);
    const processedFilesRef = useRef(new Set());
    const removedFilesRef = useRef(new Set()); // Track files that were removed before processing completed
    const previousFileItemsRef = useRef([]); // Track FilePond's previous state to detect removals
    const serverUrl = "/media-helper";
    const [inputUrl, setInputUrl] = useState("");
    const [showInputUI, setShowInputUI] = useState(false);
    const { t } = useTranslation();

    // Add effect to automatically process files when added
    useEffect(() => {
        if (files && files.length > 0 && pondRef.current) {
            // Process all files that haven't been processed yet
            files.forEach((file) => {
                if (
                    file &&
                    !processedFilesRef.current.has(file.id) &&
                    !isYoutubeUrl(file.source?.url)
                ) {
                    processedFilesRef.current.add(file.id);
                    pondRef.current.processFile(file);
                }
            });
        }

        // Sync previousFileItemsRef with files prop when it changes
        // This ensures we have a baseline for comparison
        // Always sync (not just when empty) to handle case where files are removed then re-added
        if (files && files.length > 0) {
            previousFileItemsRef.current = files;
        }
    }, [files]);

    const [processingLabel, setProcessingLabel] = useState(
        t("Checking file..."),
    );
    const labelIdle = `${t("Drag & Drop your files or")} <span class="filepond--label-action">${t("Browse")}</span>`;

    // Helper function to check if a file was removed before processing completed
    const isFileRemoved = (fileIdentifier) => {
        if (!fileIdentifier) return false;
        return removedFilesRef.current.has(fileIdentifier);
    };

    const handleAddFile = () => {
        // Validate URL format
        try {
            new URL(inputUrl);
        } catch (err) {
            alert(t("Please enter a valid URL"));
            return;
        }

        // If it's a YouTube URL, handle it separately without going through FilePond
        if (isYoutubeUrl(inputUrl)) {
            const youtubeResponse = {
                url: inputUrl,
                gcs: inputUrl,
                type: "video/youtube", // custom type used internally
                filename: getFilename(inputUrl),
                originalFilename: getFilename(inputUrl),
                payload: JSON.stringify([
                    JSON.stringify({
                        type: "image_url",
                        url: inputUrl,
                        gcs: inputUrl,
                        originalFilename: getFilename(inputUrl),
                    }),
                ]),
            };

            // Pass the response to your existing chat logic
            addUrl(youtubeResponse);

            // Add to FilePond UI with an id to prevent processing
            setFiles((prevFiles) => [
                ...prevFiles,
                {
                    id: `youtube-${Date.now()}`, // Add a unique id
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
                        onupdatefiles={(fileItems) => {
                            // Use FilePond's previous state (not the stale files prop) to detect removals
                            const previousFileItems =
                                previousFileItemsRef.current;

                            // Only handle removal logic when files are actually removed from FilePond
                            if (previousFileItems.length > fileItems.length) {
                                // Track existing file identifiers (serverId, id, or filename)
                                const existingIdentifiers = new Set(
                                    fileItems
                                        .map((f) => {
                                            // Use serverId if available (assigned by FilePond during processing)
                                            if (f.serverId) return f.serverId;
                                            if (f.id) return f.id;
                                            // Fallback to filename
                                            if (f.file && f.file.name)
                                                return f.file.name;
                                            if (f.filename) return f.filename;
                                            if (f.source && f.source.filename)
                                                return f.source.filename;
                                            if (f.source instanceof File)
                                                return f.source.name;
                                            return null;
                                        })
                                        .filter(Boolean),
                                );

                                // Find which files are no longer in the list (compare against FilePond's previous state)
                                const removedFiles = previousFileItems.filter(
                                    (f) => {
                                        // Get identifier for this file
                                        let identifier = null;
                                        if (f.serverId) identifier = f.serverId;
                                        else if (f.id) identifier = f.id;
                                        else {
                                            // Fallback to filename
                                            if (f.file && f.file.name)
                                                identifier = f.file.name;
                                            else if (f.filename)
                                                identifier = f.filename;
                                            else if (
                                                f.source &&
                                                f.source.filename
                                            )
                                                identifier = f.source.filename;
                                            else if (f.source instanceof File)
                                                identifier = f.source.name;
                                        }

                                        // If we found an identifier, check if it's still in the fileset
                                        return (
                                            identifier &&
                                            !existingIdentifiers.has(identifier)
                                        );
                                    },
                                );

                                // Track removed files to prevent them from being added to urlsData
                                // even if processing completes later
                                removedFiles.forEach((f) => {
                                    // Track by serverId (assigned by FilePond during processing)
                                    if (f.serverId) {
                                        removedFilesRef.current.add(f.serverId);
                                    }
                                    // Track by id
                                    if (f.id) {
                                        removedFilesRef.current.add(f.id);
                                    }

                                    // Extract URL/GCS from processed files for matching
                                    const source = f.source;
                                    if (
                                        source &&
                                        typeof source === "object" &&
                                        !(source instanceof File)
                                    ) {
                                        // After processing, source is the response object
                                        if (source.url) {
                                            removedFilesRef.current.add(
                                                source.url,
                                            );
                                        }
                                        if (source.gcs) {
                                            removedFilesRef.current.add(
                                                source.gcs,
                                            );
                                        }
                                        if (source.originalFilename) {
                                            removedFilesRef.current.add(
                                                source.originalFilename,
                                            );
                                        }
                                        if (source.filename) {
                                            removedFilesRef.current.add(
                                                source.filename,
                                            );
                                        }
                                    }

                                    // Use filename as fallback identifier
                                    let filename = null;
                                    if (f.file && f.file.name)
                                        filename = f.file.name;
                                    else if (f.filename) filename = f.filename;
                                    else if (f.source && f.source.filename)
                                        filename = f.source.filename;
                                    else if (f.source instanceof File)
                                        filename = f.source.name;
                                    if (filename) {
                                        removedFilesRef.current.add(filename);
                                    }
                                    // Also track by URL if source is a URL string
                                    if (
                                        typeof f.source === "string" &&
                                        f.source.startsWith("http")
                                    ) {
                                        removedFilesRef.current.add(f.source);
                                    }
                                });

                                if (removedFiles.length > 0 && setUrlsData) {
                                    // Extract matching information from removed files
                                    // After processing, files have response data in source (url, gcs, originalFilename)
                                    const removedFileMatches = removedFiles.map(
                                        (f) => {
                                            // After processing, source is the response object with url/gcs
                                            const source = f.source;
                                            // Also check the file item itself for response data
                                            const fileData = f;

                                            return {
                                                // For unprocessed File objects
                                                filename:
                                                    source instanceof File
                                                        ? source.name
                                                        : source?.filename ||
                                                          source?.originalFilename ||
                                                          fileData?.filename ||
                                                          fileData?.originalFilename,
                                                // For processed files (response objects)
                                                url:
                                                    source?.url ||
                                                    fileData?.url,
                                                gcs:
                                                    source?.gcs ||
                                                    fileData?.gcs,
                                                // Also check serverId for tracking
                                                serverId:
                                                    f.serverId ||
                                                    fileData?.serverId,
                                            };
                                        },
                                    );

                                    // Remove matching entries from urlsData
                                    if (removedFileMatches.length > 0) {
                                        setUrlsData((prevUrls) => {
                                            const filteredUrls =
                                                prevUrls.filter((item) => {
                                                    // Check if any removed file matches this item
                                                    const isRemoved =
                                                        removedFileMatches.some(
                                                            (match) => {
                                                                // Match by URL (most reliable for processed files)
                                                                if (
                                                                    match.url &&
                                                                    item.url &&
                                                                    match.url ===
                                                                        item.url
                                                                ) {
                                                                    return true;
                                                                }

                                                                // Match by GCS URL
                                                                if (
                                                                    match.gcs &&
                                                                    item.gcs &&
                                                                    match.gcs ===
                                                                        item.gcs
                                                                ) {
                                                                    return true;
                                                                }

                                                                // Match by filename/originalFilename
                                                                if (
                                                                    match.filename
                                                                ) {
                                                                    if (
                                                                        item.filename ===
                                                                        match.filename
                                                                    ) {
                                                                        return true;
                                                                    }
                                                                    if (
                                                                        item.originalFilename ===
                                                                        match.filename
                                                                    ) {
                                                                        return true;
                                                                    }
                                                                }

                                                                return false;
                                                            },
                                                        );

                                                    return !isRemoved;
                                                });

                                            return filteredUrls;
                                        });
                                    }
                                }
                            }

                            // Update files state
                            setFiles(fileItems);

                            // Update our ref to track FilePond's current state for next comparison
                            previousFileItemsRef.current = fileItems;

                            // If all files are removed, reset upload state and clear removed files tracking
                            if (fileItems.length === 0) {
                                setIsUploadingMedia(false);
                                removedFilesRef.current.clear();
                            }
                        }}
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
                                    // Explicitly snap progress to 100% so the FilePond UI shows the check-mark
                                    if (typeof progress === "function") {
                                        progress(true, 100, 100);
                                    }
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
                                        // Ensure progress shows complete before marking load done
                                        if (typeof progress === "function") {
                                            progress(true, 100, 100);
                                        }
                                        // For fetched URLs, try to extract a meaningful filename from the URL
                                        const urlFilename = fileUrl
                                            .split("/")
                                            .pop()
                                            .split("?")[0];
                                        // Check if file was removed before adding to urlsData
                                        // Use URL or filename as identifier for remote files
                                        if (
                                            isFileRemoved(fileUrl) ||
                                            isFileRemoved(urlFilename)
                                        ) {
                                            // File was removed - abort processing to clean up UI state
                                            setIsUploadingMedia(false);
                                            error({
                                                body: "File was removed before processing could complete.",
                                                type: "error",
                                            });
                                            return;
                                        }
                                        const responseWithFilename = {
                                            ...response.data,
                                            originalFilename: urlFilename,
                                        };
                                        addUrl(responseWithFilename);
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
                                        originalFilename: getFilename(
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
                                    // Remote files have already been fetched, so instantly mark progress complete
                                    progress(true, 100, 100);
                                    load(file.source);
                                    setIsUploadingMedia(false);
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

                                if (isSupportedFileUrl(file?.name)) {
                                    setIsUploadingMedia(true);
                                }

                                // Start showing upload progress
                                progress(true, 0, file.size);
                                const fileHash = await hashMediaFile(file);

                                // Check if file exists
                                try {
                                    const response = await axios.get(
                                        `${serverUrl}?hash=${fileHash}&checkHash=true`,
                                    );
                                    if (
                                        response.status === 200 &&
                                        response.data?.url
                                    ) {
                                        if (isSupportedFileUrl(file?.name)) {
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
                                        // Include original filename and hash in the response data
                                        const responseWithFilename = {
                                            ...response.data,
                                            originalFilename: file.name,
                                            hash:
                                                response.data.hash || fileHash,
                                        };
                                        // Check if file was removed before adding to urlsData
                                        // Check both filename and URLs from response
                                        if (
                                            isFileRemoved(file.name) ||
                                            isFileRemoved(
                                                responseWithFilename.originalFilename,
                                            ) ||
                                            isFileRemoved(
                                                responseWithFilename.url,
                                            ) ||
                                            isFileRemoved(
                                                responseWithFilename.gcs,
                                            )
                                        ) {
                                            // File was removed - abort processing to clean up UI state
                                            error({
                                                body: "File was removed before processing could complete.",
                                                type: "error",
                                            });
                                            return;
                                        }

                                        // Ensure progress shows 100% completion
                                        progress(true, 100, 100);
                                        load(responseWithFilename);
                                        addUrl(responseWithFilename);
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
                                                    progress(
                                                        true,
                                                        cloudProgress,
                                                        100,
                                                    );
                                                    // Stop at 99% and let request.onload set it to 100%
                                                    // This prevents race conditions where onload fires before interval completes
                                                    if (cloudProgress >= 99) {
                                                        clearInterval(
                                                            cloudProgressInterval,
                                                        );
                                                        cloudProgressInterval =
                                                            null;
                                                    }
                                                },
                                                cloudProcessingInterval,
                                            );
                                        }
                                    }
                                };

                                request.onload = function () {
                                    const totalTime =
                                        Date.now() - startTimestamp;

                                    // Always clear the interval if it exists
                                    if (cloudProgressInterval) {
                                        clearInterval(cloudProgressInterval);
                                        cloudProgressInterval = null;
                                    }
                                    // Always set progress to 100% when upload completes
                                    // This ensures the UI shows completion even if the interval was already cleared
                                    progress(true, 100, 100);
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
                                        if (isSupportedFileUrl(file?.name)) {
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
                                        // Include original filename and hash in the response data
                                        const responseWithFilename = {
                                            ...responseData,
                                            originalFilename: file.name,
                                            hash:
                                                responseData.hash ||
                                                responseData.file?.hash ||
                                                fileHash,
                                        };
                                        // Check if file was removed before adding to urlsData
                                        // Check both filename and URLs from response
                                        if (
                                            isFileRemoved(file.name) ||
                                            isFileRemoved(
                                                responseWithFilename.originalFilename,
                                            ) ||
                                            isFileRemoved(
                                                responseWithFilename.url,
                                            ) ||
                                            isFileRemoved(
                                                responseWithFilename.gcs,
                                            )
                                        ) {
                                            // File was removed - abort processing to clean up UI state
                                            setIsUploadingMedia(false);
                                            // Clear any running progress interval
                                            if (cloudProgressInterval) {
                                                clearInterval(
                                                    cloudProgressInterval,
                                                );
                                                cloudProgressInterval = null;
                                            }
                                            error({
                                                body: "File was removed before processing could complete.",
                                                type: "error",
                                            });
                                            return;
                                        }

                                        load(responseWithFilename);
                                        addUrl(responseWithFilename);
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
                                    `${serverUrl}?hash=${fileHash}`,
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
                            revert: (uniqueFileId, load, error) => {
                                console.log(
                                    "Revert called with uniqueFileId:",
                                    uniqueFileId,
                                );
                                load(null);
                            },
                        }}
                        onprocessfile={(error, file) => {
                            if (error) {
                                console.error("Error:", error);
                                setIsUploadingMedia(false);
                            } else {
                                const filetype = file.file.type;
                                // For document files, wait 10 seconds for indexing
                                if (RAG_MIME_TYPES.includes(filetype)) {
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
                        allowRevert={true}
                        allowRemove={true}
                        allowReplace={false}
                    />
                </div>
            </div>
        </>
    );
}

export default MyFilePond;
