import { FilePond, registerPlugin } from "react-filepond";
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import mime from 'mime-types';

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
registerPlugin(FilePondPluginImageExifOrientation, FilePondPluginImagePreview, FilePondPluginFileValidateType);

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
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.webp',
    '.tiff',
    '.svg'
];

function isImageUrl(url) {
    const urlExt = '.' + url.split('.').pop();
    const mimeType = mime.contentType(urlExt);
    
    return IMAGE_EXTENSIONS.includes(urlExt) && mimeType.startsWith('image/');
}

const DOC_MIME_TYPES = DOC_EXTENSIONS.map(ext => mime.lookup(ext));
const IMAGE_MIME_TYPES = IMAGE_EXTENSIONS.map(ext => mime.lookup(ext));
const ACCEPTED_FILE_TYPES = [...DOC_MIME_TYPES, ...IMAGE_MIME_TYPES];
const FILE_TYPE_NOT_ALLOWED_ERROR = "File of type {fileExtension} is not allowed.";

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
                    url: "/media-helper",
                    process: {
                        onload: (response) => {
                            addUrl(JSON.parse(response).url);
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
                            console.log("File uploaded", file);
                            if (ACCEPTED_FILE_TYPES.includes(file.file.type)) {
                                setFiles((oldFiles) =>
                                    oldFiles.filter(
                                        (f) => f.serverId !== file.serverId
                                    ),
                                );
                            } else {
                                console.error('Unsupported file type:', file.file.type);
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

export { isDocumentUrl, isImageUrl };
