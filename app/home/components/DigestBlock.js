"use client";

import { RefreshCw } from "lucide-react";
import ReactTimeAgo from "react-time-ago";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";
import { useRegenerateDigestBlock } from "../../queries/digest";
import classNames from "../../utils/class-names";
import { useTranslation } from "react-i18next";
import Loader from "../../components/loader";
import { useContext } from "react";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";

export default function DigestBlock({ block }) {
    const regenerateDigestBlock = useRegenerateDigestBlock();
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);

    if (!block) {
        return null;
    }

    const isRebuilding =
        regenerateDigestBlock.isPending || block?.state?.status === "pending";

    return (
        <div key={block._id} className="bg-gray-50 p-4 rounded-md border">
            <div className="flex justify-between gap-2 items-center mb-4">
                <h4 className="font-semibold">{block.title}</h4>
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
                                            isRebuilding ? "animate-spin" : "",
                                            "inline-block",
                                        )}
                                        size={14}
                                    />
                                </button>
                            )}
                            <div className="flex items-center justify-center gap-1">
                                {isRebuilding ? (
                                    t("Rebuilding...")
                                ) : (
                                    <>
                                        {t("Updated")}{" "}
                                        <ReactTimeAgo
                                            date={block.updatedAt}
                                            locale={language}
                                        />
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="text-sm">
                <div className="max-h-64 overflow-auto">
                    <BlockContent block={block} />
                </div>
            </div>
        </div>
    );
}

function BlockContent({ block }) {
    const { t } = useTranslation();

    if (block.state?.status === "pending" && !block.content) {
        return (
            <div className="text-gray-500 flex items-center gap-4 m-2 ">
                <Loader />
                {t("Building")}. {t("This may take a minute or two.")}
            </div>
        );
    }

    if (block.state?.status === "failure") {
        return (
            <div className="text-red-500">
                {t("Error building digest block:")} {block.state.error}
            </div>
        );
    }

    if (!block.content) {
        return "(No content)";
    }

    return convertMessageToMarkdown(JSON.parse(block.content));
}
