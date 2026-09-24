import { useCallback, useRef, useState } from "react";
import {
    AUDIO_EXTENSIONS,
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    getExtension,
} from "../../../utils/mediaUtils";

const extensions = {
    image: IMAGE_EXTENSIONS,
    audio: AUDIO_EXTENSIONS,
    video: VIDEO_EXTENSIONS,
};

export function useReferenceUpload({
    uploadFiles,
    onAttach,
    referencesByParameterKind,
    selectionKey,
    isUploading,
    t,
}) {
    const inputRef = useRef(null);
    const pendingRow = useRef(null);
    const currentSelectionKey = useRef(selectionKey);
    currentSelectionKey.current = selectionKey;
    const [error, setError] = useState(null);

    const uploadReferences = useCallback(
        async (files, row) => {
            if (isUploading || !row?.kind) return;
            setError(null);
            const compatible = Array.from(files || []).filter((file) => {
                const mime = String(file.type || "").toLowerCase();
                if (mime && mime !== "application/octet-stream") {
                    return mime.startsWith(`${row.kind}/`);
                }
                return extensions[row.kind]?.includes(getExtension(file.name));
            });
            if (!compatible.length) {
                setError(t("Choose a file that matches this reference type."));
                return;
            }
            const max = row.range?.max;
            const remaining =
                max == null
                    ? compatible.length
                    : Math.max(
                          0,
                          Number(max) -
                              (referencesByParameterKind[row.kind]?.length ||
                                  0),
                      );
            if (remaining === 0) return;
            const key = currentSelectionKey.current;
            const uploaded = await uploadFiles(compatible.slice(0, remaining), {
                selectUploaded: false,
            });
            if (uploaded.length && key === currentSelectionKey.current) {
                onAttach(uploaded, { referenceKind: row.kind });
            }
        },
        [isUploading, onAttach, referencesByParameterKind, t, uploadFiles],
    );

    const chooseReferences = useCallback(
        (row) => {
            if (isUploading || !row?.kind || !inputRef.current) return;
            pendingRow.current = { row, selectionKey };
            inputRef.current.accept = `${row.kind}/*`;
            inputRef.current.click();
        },
        [isUploading, selectionKey],
    );

    const onFileSelect = useCallback(
        (event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            const pending = pendingRow.current;
            if (
                !files.length ||
                pending?.selectionKey !== currentSelectionKey.current
            ) {
                return;
            }
            return uploadReferences(files, pending.row);
        },
        [uploadReferences],
    );

    return {
        inputRef,
        chooseReferences,
        uploadReferences,
        onFileSelect,
        error,
    };
}
