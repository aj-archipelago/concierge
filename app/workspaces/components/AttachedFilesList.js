import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getFileIcon } from "../../../src/utils/mediaUtils";

/**
 * Display a list of attached files as chips with remove buttons
 *
 * @param {Object} props
 * @param {Array} props.files - Array of file objects
 * @param {Function} props.onRemove - Callback when a file is removed (receives index)
 * @param {boolean} props.disabled - Whether remove buttons are disabled
 */
export default function AttachedFilesList({ files = [], onRemove, disabled }) {
    const { t } = useTranslation();

    if (files.length === 0) return null;

    return (
        <>
            {files.map((file, index) => {
                const fileName =
                    file.displayFilename || file.originalName || file.filename;
                const Icon = getFileIcon(fileName);
                return (
                    <div
                        key={file.hash || file._id || index}
                        className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs"
                    >
                        <Icon className="w-3 h-3 text-gray-500 flex-shrink-0" />
                        <span
                            className="text-gray-700 dark:text-gray-300 truncate max-w-20"
                            title={fileName}
                        >
                            {fileName}
                        </span>
                        <button
                            type="button"
                            onClick={() => onRemove(index)}
                            className="hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full p-0.5"
                            title={t("Remove file")}
                            disabled={disabled}
                        >
                            <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                        </button>
                    </div>
                );
            })}
        </>
    );
}
