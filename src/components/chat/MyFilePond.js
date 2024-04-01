import { FilePond, registerPlugin } from 'react-filepond'

// Import FilePond styles
import 'filepond/dist/filepond.min.css';
import './MyFilePond.css'
// Import the Image EXIF Orientation and Image Preview plugins
// Note: These need to be installed separately
// `npm i filepond-plugin-image-preview filepond-plugin-image-exif-orientation --save`
import FilePondPluginImageExifOrientation from 'filepond-plugin-image-exif-orientation'
import FilePondPluginImagePreview from 'filepond-plugin-image-preview'
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css'

// Register the plugins
registerPlugin(FilePondPluginImageExifOrientation, FilePondPluginImagePreview)

// Our app
function MyFilePond({addUrl, files, setFiles, labelIdle='Drag & Drop your files or <span class="filepond--label-action">Browse</span>'}) {

  return (
    <>
      <FilePond
        files={files}
        onupdatefiles={setFiles}
        allowMultiple={true}
        maxFiles={3}
        server={{
          url: '/media-helper',
          process: {
            onload: (response) => {
              addUrl(JSON.parse(response).url);
            },
            onerror: (response) => {
              console.error('Error:', response);
            },
          }
        }}
        name="files" /* sets the file input name, it's filepond by default */
        labelIdle={labelIdle}
        allowProcess={false}
        credits={false}
        allowRevert={false}
        allowReplace={false}
      />
    </>
  )
}

export default MyFilePond;