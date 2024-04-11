import { FilePond, registerPlugin } from "react-filepond";

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
registerPlugin(FilePondPluginImageExifOrientation, FilePondPluginImagePreview);

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
    ".csv",
];

function isDocumentUrl(url) {
    const urlExt = url.split(".").pop();
    return DOC_EXTENSIONS.includes("." + urlExt);
}

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
                onprocessfile = {(error, file) => {
                    setTimeout( () => {
                        if (error) {
                            console.error("Error:", error);
                        } else {
                            console.log("File uploaded", file);
                            if (isDocumentUrl(file.file.name)) {
                                setFiles((oldFiles) =>
                                    oldFiles.filter(
                                        (f) => f.serverId !== file.serverId,
                                    ),
                                );
                            }
                        }
                    }, 5000); // Delay file removal from upload screen timeout
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

export { isDocumentUrl };
