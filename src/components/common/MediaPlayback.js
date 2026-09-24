"use client";

import { forwardRef, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";

// A failed load is not proof of deletion: a network or playback error can also
// cause it. Keep the file record intact and let the user retry this player.
const MediaPlayback = forwardRef(function MediaPlayback(
    { as: Element = "video", src, onError, compact = false, ...props },
    ref,
) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [failedSource, setFailedSource] = useState(null);
    useEffect(() => setFailedSource(null), [src]);

    if (failedSource !== null && failedSource === src) {
        return (
            <div
                role="status"
                dir={direction}
                className={`flex h-full w-full min-w-0 overflow-auto rounded-lg bg-gray-100 text-center text-gray-700 dark:bg-gray-800 dark:text-gray-200 ${compact ? "p-2 text-xs" : "p-4 text-sm"}`}
            >
                <div className="m-auto flex w-full shrink-0 flex-col items-center gap-3">
                    <p>{t("Media preview unavailable")}</p>
                    {!compact && (
                        <p className="max-w-sm break-words text-xs text-gray-600 dark:text-gray-300">
                            {t(
                                "Retry the preview. If it still fails, the file may have been removed or cannot be played.",
                            )}
                        </p>
                    )}
                    <button
                        type="button"
                        className="min-h-[40px] shrink-0 rounded-md bg-sky-700 px-4 py-2 text-white hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500 dark:focus-visible:outline-sky-400"
                        onClick={(event) => {
                            event.stopPropagation();
                            setFailedSource(null);
                        }}
                    >
                        {t("Retry preview")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <Element
            {...props}
            key={src}
            ref={ref}
            src={src}
            onError={(event) => {
                setFailedSource(src);
                onError?.(event);
            }}
        />
    );
});

export default MediaPlayback;
