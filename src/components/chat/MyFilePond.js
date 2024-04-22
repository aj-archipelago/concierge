import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginFileValidateType from "filepond-plugin-file-validate-type";
import mime from "mime-types";

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
    ".pdf",
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

    return IMAGE_EXTENSIONS.includes(urlExt) && mimeType.startsWith("image/");
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
}) {
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
                    url: "/media-helper?useGoogle=true",
                    process: {
                        onload: (response) => {
                            const data = JSON.parse(response);
                            addUrl(data);
                        },
                        onerror: (response) => {
                            console.error("Error:", response);
                        },
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
