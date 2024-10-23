import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import mime from "mime-types";
import crypto from "crypto";
import axios from "axios";
import { IoIosVideocam } from "react-icons/io";
import { FaYoutube } from "react-icons/fa";
import { AiOutlineClose } from "react-icons/ai";

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
                    <span className="inline-block px-2">
                        <FaYoutube />
                    </span>
                    <span className="underline">
                        {t("Add Youtube / Remote Media Url")}
                    </span>
                    <span className="inline-block px-2">
                        <IoIosVideocam />
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

const DOC_EXTENSIONS = [
    ".txt",
    ".json",
    ".csv",
    ".md",
    ".xml",
    ".js",
    ".html",
    ".css",
    ".docx",
    ".xlsx",
];

function isDocumentUrl(url) {
    const urlExt = getExtension(url);
    return DOC_EXTENSIONS.includes(urlExt);
}

const IMAGE_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".tiff",
    ".svg",
    ".pdf",
];

const VIDEO_EXTENSIONS = [
    ".mp4",
    ".webm",
    ".ogg",
    ".mov",
    ".avi",
    ".flv",
    ".wmv",
    ".mkv",
];

const AUDIO_EXTENSIONS = [".wav", ".mp3", ".aiff", ".aac", ".ogg", ".flac"];

// Extracts the filename from a URL
export function getFilename(url) {
    try {
        // Create a URL object to handle parsing
        const urlObject = new URL(url);

        // Get the pathname and remove leading/trailing slashes
        const path = urlObject.pathname.replace(/^\/|\/$/g, "");

        // Get the last part of the path (filename)
        const fullFilename = path.split("/").pop() || "";

        // Decode the filename to handle URL encoding
        const decodedFilename = decodeURIComponent(fullFilename);

        // Split by underscore and remove the first part if it exists
        const parts = decodedFilename.split("_");
        const relevantParts = parts.length > 1 ? parts.slice(1) : parts;

        // Join the parts back together
        return relevantParts.join("_");
    } catch (error) {
        console.error("Error parsing URL:", error);
        return "";
    }
}

export function getExtension(url) {
    try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname;
        return "." + pathname.split(".").pop().toLowerCase();
    } catch (error) {
        return "." + url.split(".").pop().split(/[?#]/)[0].toLowerCase();
    }
}

function isImageUrl(url) {
    const urlExt = getExtension(url);
    const mimeType = mime.contentType(urlExt);
    return (
        IMAGE_EXTENSIONS.includes(urlExt) &&
        (mimeType.startsWith("image/") || mimeType === "application/pdf")
    );
}

function isVideoUrl(url) {
    const urlExt = getExtension(url);
    const mimeType = mime.contentType(urlExt);
    return VIDEO_EXTENSIONS.includes(urlExt) && mimeType.startsWith("video/");
}

function isAudioUrl(url) {
    const urlExt = getExtension(url);
    const mimeType = mime.contentType(urlExt);
    return AUDIO_EXTENSIONS.includes(urlExt) && mimeType.startsWith("audio/");
}

function isMediaUrl(url) {
    return isImageUrl(url) || isVideoUrl(url) || isAudioUrl(url);
}

async function hashMediaFile(file) {
    const hash = crypto.createHash("sha256");

    const chunkSize = 512 * 1024;

    const numOfChunks = Math.ceil(file.size / chunkSize);

    const reader = new FileReader();

    async function processChunk(index) {
        const start = index * chunkSize;
        const end = start + chunkSize;
        const blobSlice = file.slice(start, end);

        return new Promise((resolve, reject) => {
            reader.onload = (event) => {
                const arrayBuffer = event.target.result;
                const array = new Uint8Array(arrayBuffer);
                array.forEach((chunk) => {
                    hash.update(new Uint8Array([chunk]));
                });

                resolve();
            };

            reader.onerror = reject;

            reader.readAsArrayBuffer(blobSlice);
        });
    }

    for (let i = 0; i < numOfChunks; i++) {
        await processChunk(i);
    }

    // Obtain the hash of the file
    return hash.digest("hex");
}

const DOC_MIME_TYPES = DOC_EXTENSIONS.map((ext) => mime.lookup(ext));
const IMAGE_MIME_TYPES = IMAGE_EXTENSIONS.map((ext) => mime.lookup(ext));
const VIDEO_MIME_TYPES = VIDEO_EXTENSIONS.map((ext) => mime.lookup(ext));
const AUDIO_MIME_TYPES = AUDIO_EXTENSIONS.map((ext) => mime.lookup(ext));

const ACCEPTED_FILE_TYPES = [
    ...DOC_MIME_TYPES,
    ...IMAGE_MIME_TYPES,
    ...VIDEO_MIME_TYPES,
    ...AUDIO_MIME_TYPES,
];
const FILE_TYPE_NOT_ALLOWED_ERROR =
    "File of type {fileExtension} is not allowed.";

// Our app
function MyFilePond({ addUrl, files, setFiles, setIsUploadingMedia }) {
    const serverUrl = "/media-helper?useGoogle=true";
    const [inputUrl, setInputUrl] = useState("");
    const [showInputUI, setShowInputUI] = useState(false);
    const { t } = useTranslation();
    const labelIdle = `${t("Drag & Drop your files or")} <span class="filepond--label-action">${t("Browse")}</span>`;

    const handleAddFile = () => {
        setIsUploadingMedia(true);
        setFiles([...files, { source: inputUrl }]);
        setInputUrl("");
    };

    return (
        <>
            <div className="flex items-center justify-center pb-2 h-8">
                <RemoteUrlInputUI
                    inputUrl={inputUrl}
                    setInputUrl={setInputUrl}
                    handleAddFile={handleAddFile}
                    showInputUI={showInputUI}
                    setShowInputUI={setShowInputUI}
                />
            </div>
            <div className="flex">
                <div className="flex-grow w-full">
                    <FilePond
                        files={files}
                        onupdatefiles={setFiles}
                        allowFileTypeValidation={true}
                        labelFileTypeNotAllowed={FILE_TYPE_NOT_ALLOWED_ERROR}
                        acceptedFileTypes={ACCEPTED_FILE_TYPES}
                        allowMultiple={true}
                        // maxFiles={3}
                        server={{
                            url: serverUrl,
                            fetch: async (
                                url,
                                load,
                                error,
                                progress,
                                abort,
                                headers,
                            ) => {
                                try {
                                    const response = await axios.get(
                                        `${serverUrl}&fetch=${url}`,
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
                                                filename,
                                                url,
                                            }),
                                        );
                                        // load(response.data);
                                        addUrl(response.data);
                                        setIsUploadingMedia(false);
                                        return;
                                    }
                                } catch (err) {
                                    console.error(err);
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
                                const isRemote = !(file instanceof File);
                                if (isRemote) {
                                    setIsUploadingMedia(false);
                                    load(file.source);
                                    return;
                                }

                                if (isMediaUrl(file?.name)) {
                                    setIsUploadingMedia(true);
                                }
                                const fileHash = await hashMediaFile(file);

                                // Check if file with same hash is already on the server
                                try {
                                    const response = await axios.get(
                                        `${serverUrl}&hash=${fileHash}&checkHash=true`,
                                    );
                                    if (response.status === 200) {
                                        // console.log(response.data)
                                        if (
                                            response.data &&
                                            response.data.url
                                        ) {
                                            load(response.data);
                                            addUrl(response.data);
                                            setIsUploadingMedia(false);
                                            return;
                                        }
                                    }
                                } catch (err) {
                                    console.error(err);
                                    setIsUploadingMedia(false);
                                }

                                // Do the uploading after checking
                                const formData = new FormData();
                                formData.append("hash", fileHash);
                                formData.append(fieldName, file, file.name);
                                const request = new XMLHttpRequest();
                                request.open(
                                    "POST",
                                    `${serverUrl}&hash=${fileHash}`,
                                ); // attach fileHash as a URL parameter

                                request.upload.onprogress = (e) => {
                                    progress(
                                        e.lengthComputable,
                                        e.loaded,
                                        e.total,
                                    );
                                };
                                request.onload = function () {
                                    if (
                                        request.status >= 200 &&
                                        request.status < 300
                                    ) {
                                        let responseData = request.responseText;
                                        try {
                                            responseData = JSON.parse(
                                                request.responseText,
                                            ); // Parse the response to a JS object
                                        } catch (err) {
                                            console.error(err);
                                        }
                                        load(responseData);
                                        addUrl(responseData); // Call 'addUrl' with the parsed response data
                                        setIsUploadingMedia(false);
                                    } else {
                                        error("Error while uploading");
                                        setIsUploadingMedia(false);
                                    }
                                };
                                request.send(formData);

                                // expose an abort method so FilePond can cancel the file if requested
                                return {
                                    abort: () => {
                                        request.abort();
                                        // Let FilePond know the request has been cancelled
                                        abort();
                                    },
                                };
                            },
                        }}
                        onprocessfile={(error, file) => {
                            setTimeout(() => {
                                if (error) {
                                    console.error("Error:", error);
                                } else {
                                    const filetype = file.file.type;
                                    //only doc files should be timed as rag ll pick them
                                    if (DOC_MIME_TYPES.includes(filetype)) {
                                        setFiles((oldFiles) =>
                                            oldFiles.filter(
                                                (f) =>
                                                    f.serverId !==
                                                    file.serverId,
                                            ),
                                        );
                                    }
                                }
                            }, 10000);
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

export { isDocumentUrl, isImageUrl, isVideoUrl, isMediaUrl, isAudioUrl };
