"use client";

import TimeAgo from "javascript-time-ago";
import ar from "javascript-time-ago/locale/ar.json";
import en from "javascript-time-ago/locale/en.json";
import { RefreshCw } from "lucide-react";
import ReactTimeAgo from "react-time-ago";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";
import { useRegenerateDigestBlock } from "../../queries/digest";
import classNames from "../../utils/class-names";
import { useTranslation } from "react-i18next";
import Loader from "../../components/loader";

if (typeof document !== "undefined") {
    TimeAgo.addDefaultLocale(document.documentElement.lang === "ar" ? ar : en);
}

export default function DigestBlock({ block }) {
    const regenerateDigestBlock = useRegenerateDigestBlock();
    const { t } = useTranslation();

    if (!block) {
        return null;
    }

    return (
        <div key={block._id} className="bg-gray-50 p-4 rounded-md border">
            <div className="flex justify-between gap-2">
                <h4 className="mb-4 font-semibold">{block.title}</h4>
                {block.updatedAt && (
                    <div>
                        <div className="text-xs flex items-center gap-2 rounded-full px-3 py-2 border bg-gray-50">
                            {block.updatedAt && (
                                <button
                                    onClick={() => {
                                        regenerateDigestBlock.mutate({
                                            blockId: block._id,
                                        });
                                    }}
                                >
                                    <RefreshCw
                                        className={classNames(
                                            "text-gray-600 hover:text-gray-800",
                                            regenerateDigestBlock.isPending
                                                ? "animate-spin"
                                                : "",
                                            "inline-block",
                                        )}
                                        size={14}
                                    />
                                </button>
                            )}
                            <div className="flex items-center justify-center gap-1">
                                {regenerateDigestBlock.isPending ? (
                                    t("Rebuilding...")
                                ) : (
                                    <>
                                        {t("Updated")}{" "}
                                        <ReactTimeAgo date={block.updatedAt} />
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="text-sm">
                <div className="max-h-64 overflow-auto">
                    {!block.updatedAt && (
                        <div className="text-gray-500 flex items-center gap-4 m-2 ">
                            <Loader />
                            {t("Building")}.{" "}
                            {t("This may take a minute or two.")}
                        </div>
                    )}
                    {block.content
                        ? convertMessageToMarkdown(JSON.parse(block.content))
                        : null}
                </div>
            </div>
        </div>
    );
}
