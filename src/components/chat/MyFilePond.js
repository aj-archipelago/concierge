import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import mime from "mime-types";
import crypto from "crypto";
import axios from "axios";

// Import FilePond styles
import "filepond/dist/filepond.min.css";
import "./MyFilePond.css";
// Import the Image EXIF Orientation and Image Preview plugins
// Note: These need to be installed separately
// `npm i filepond-plugin-image-preview filepond-plugin-image-exif-orientation --save`
import FilePondPluginImageExifOrientation from "filepond-plugin-image-exif-orientation";
import FilePondPluginImagePreview from "filepond-plugin-image-preview";
import "filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css";

// Register the plugins
registerPlugin(
    FilePondPluginImageExifOrientation,
    FilePondPluginImagePreview,
    FilePondPluginFileValidateType,
);

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
    const urlExt = url.split(".").pop();
    return DOC_EXTENSIONS.includes("." + urlExt);
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

function isImageUrl(url) {
    const urlExt = "." + url.split(".").pop();
    const mimeType = mime.contentType(urlExt);

    return IMAGE_EXTENSIONS.includes(urlExt) && (mimeType.startsWith("image/") || mimeType==="application/pdf");
}

function isVideoUrl(url) {
    const urlExt = "." + url.split(".").pop();
    const mimeType = mime.contentType(urlExt);

    return VIDEO_EXTENSIONS.includes(urlExt) && mimeType.startsWith("video/");
}

function isMediaUrl(url) {
    return isImageUrl(url) || isVideoUrl(url);
}

const DOC_MIME_TYPES = DOC_EXTENSIONS.map((ext) => mime.lookup(ext));
const IMAGE_MIME_TYPES = IMAGE_EXTENSIONS.map((ext) => mime.lookup(ext));
const VIDEO_MIME_TYPES = VIDEO_EXTENSIONS.map((ext) => mime.lookup(ext));

const ACCEPTED_FILE_TYPES = [
    ...DOC_MIME_TYPES,
    ...IMAGE_MIME_TYPES,
    ...VIDEO_MIME_TYPES,
];
const FILE_TYPE_NOT_ALLOWED_ERROR =
    "File of type {fileExtension} is not allowed.";

// Our app
function MyFilePond({
    addUrl,
    files,
    setFiles,
    labelIdle = 'Drag & Drop your files or <span class="filepond--label-action">Browse</span>',
    setIsUploadingMedia,
}) {
    const serverUrl = "/media-helper?useGoogle=true";

    return (
        <>
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
                    process: async (
                        fieldName,
                        file,
                        metadata,
                        load,
                        error,
                        progress,
                        abort,
                    ) => {
                        if (isMediaUrl(file?.name)) {
                            setIsUploadingMedia(true);
                        }
                        // Create a new hash object
                        const hash = crypto.createHash("sha256");

                        // Read the file into a buffer
                        const arrayBuffer = await file.arrayBuffer();
                        const array = new Uint8Array(arrayBuffer);
                        // Update the hash object with data from file
                        array.forEach((chunk) => {
                            hash.update(new Uint8Array([chunk]));
                        });
                        // Obtain the hash of the file
                        const fileHash = hash.digest("hex");

                        // console.log('File hash', fileHash);

                        // Check if file with same hash is already on the server
                        try {
                            const response = await axios.get(
                                `${serverUrl}&hash=${fileHash}&checkHash=true`,
                            );
                            if (response.status === 200) {
                                // console.log(response.data)
                                if (response.data && response.data.url) {
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
                        formData.append("hash", fileHash); // add fileHash to formData
                        formData.append(fieldName, file, file.name);
                        const request = new XMLHttpRequest();
                        request.open("POST", `${serverUrl}&hash=${fileHash}`); // attach fileHash as a URL parameter

                        request.upload.onprogress = (e) => {
                            progress(e.lengthComputable, e.loaded, e.total);
                        };
                        request.onload = function () {
                            if (request.status >= 200 && request.status < 300) {
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
                                        (f) => f.serverId !== file.serverId,
                                    ),
                                );
                            }
                        }
                    }, 10000);
                }}
                name="files" /* sets the file input name, it's filepond by default */
                labelIdle={labelIdle}
                allowProcess={false}
                credits={false}
                allowRevert={false}
                allowReplace={false}
            />
        </>
    );
}

export default MyFilePond;

export { isDocumentUrl, isImageUrl, isVideoUrl, isMediaUrl };
