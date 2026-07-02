"use client";

import { useCallback, useState } from "react";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Share2, Users } from "lucide-react";

import ShareDialog from "./ShareDialog";
import { Button } from "@/components/ui/button";
import { useShareSettings } from "./useShareSettings";

function articleRegisterQueryKey(workspacePath) {
    return ["article-register", workspacePath];
}

async function registerArticle({
    workspacePath,
    title,
    fileHash,
    blobPath,
    filename,
}) {
    const { data } = await axios.post("/api/articles/register", {
        workspacePath,
        title: title || "",
        fileHash: fileHash || null,
        blobPath: blobPath || null,
        filename: filename || null,
    });
    if (!data?._id) {
        throw new Error("Failed to register article");
    }
    return data;
}

export default function ArticleShareButton({
    workspacePath,
    title,
    fileHash,
    blobPath,
    filename,
    className = "",
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [dialogArticleId, setDialogArticleId] = useState(null);

    const registerPayload = {
        workspacePath,
        title,
        fileHash,
        blobPath,
        filename,
    };

    const {
        data: article,
        isFetching,
        refetch,
    } = useQuery({
        queryKey: articleRegisterQueryKey(workspacePath),
        queryFn: () => registerArticle(registerPayload),
        enabled: false,
        staleTime: 60_000,
    });

    const articleId = article?._id ? String(article._id) : dialogArticleId;

    const { isShared } = useShareSettings("article", articleId, {
        enabled: Boolean(articleId),
    });

    const resolveArticleId = useCallback(async () => {
        if (articleId) return articleId;
        if (!workspacePath) {
            throw new Error("Missing article workspace path");
        }
        const { data } = await refetch();
        const id = data?._id ? String(data._id) : null;
        if (!id) {
            throw new Error("Failed to register article");
        }
        setDialogArticleId(id);
        return id;
    }, [articleId, refetch, workspacePath]);

    if (!workspacePath) return null;

    const sharedClassName = isShared
        ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/30"
        : "";
    const Icon = isShared ? Users : Share2;
    const ariaLabel = isShared ? t("Shared") : t("Share");

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className={[className, sharedClassName]
                    .filter(Boolean)
                    .join(" ")}
                disabled={isFetching}
                aria-label={ariaLabel}
                title={ariaLabel}
                onClick={async () => {
                    try {
                        await resolveArticleId();
                        setOpen(true);
                    } catch (err) {
                        console.error(
                            "Failed to register article for sharing:",
                            err,
                        );
                    }
                }}
            >
                {isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <>
                        <Icon className="me-2 h-4 w-4" />
                        {isShared ? t("Shared") : t("Share")}
                    </>
                )}
            </Button>
            {articleId ? (
                <ShareDialog
                    open={open}
                    onOpenChange={setOpen}
                    entityType="article"
                    entityId={articleId}
                />
            ) : null}
        </>
    );
}
