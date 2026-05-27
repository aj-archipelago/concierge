"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Check,
    Copy,
    ExternalLink,
    FileText,
    LayoutDashboard,
    Trash2,
    Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import classNames from "../../../../app/utils/class-names";

export default function AdvancedTab({
    form,
    automation,
    automationId,
    onFieldChange,
    latestHtmlRunId,
    onUploadFile,
    onDeleteFile,
    onDelete,
    isDeleting,
}) {
    const { t } = useTranslation();
    const fileInputRef = useRef(null);
    const [copied, setCopied] = useState(false);

    const handleCopySlug = async () => {
        try {
            await navigator.clipboard.writeText(form.slug);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // ignore
        }
    };

    const files = automation?.files || [];

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {t("Identifier")}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-1.5">
                    <Label htmlFor="advanced-slug" className="text-xs">
                        {t("Slug")}
                    </Label>
                    <div className="flex gap-2">
                        <Input
                            id="advanced-slug"
                            value={form.slug}
                            disabled
                            className="font-mono text-sm"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleCopySlug}
                            title={t("Copy")}
                        >
                            {copied ? (
                                <Check className="h-4 w-4 text-green-600" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t(
                            "URL-safe identifier. Cannot be changed after creation.",
                        )}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {t("Output")}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-3">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="produces-html"
                            checked={form.producesHtml}
                            onCheckedChange={(checked) =>
                                onFieldChange("producesHtml", Boolean(checked))
                            }
                        />
                        <Label
                            htmlFor="produces-html"
                            className="text-sm font-normal text-gray-700 dark:text-gray-300"
                        >
                            {t("Produce HTML output")}
                        </Label>
                    </div>
                    <div
                        className={classNames(
                            "flex items-center gap-2",
                            !form.producesHtml && "opacity-50",
                        )}
                    >
                        <Checkbox
                            id="pin-sidebar"
                            disabled={!form.producesHtml}
                            checked={form.producesHtml && form.pinnedToSidebar}
                            onCheckedChange={(checked) =>
                                onFieldChange(
                                    "pinnedToSidebar",
                                    Boolean(checked),
                                )
                            }
                        />
                        <Label
                            htmlFor="pin-sidebar"
                            className="text-sm font-normal text-gray-700 dark:text-gray-300"
                        >
                            {t("Pin latest HTML result to sidebar")}
                        </Label>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
                        <Checkbox
                            id="pin-home"
                            checked={Boolean(form.pinnedToHome)}
                            disabled={!automationId}
                            onCheckedChange={(checked) =>
                                onFieldChange("pinnedToHome", Boolean(checked))
                            }
                        />
                        <Label
                            htmlFor="pin-home"
                            className="text-sm font-normal text-gray-700 dark:text-gray-300 inline-flex items-center gap-1.5"
                        >
                            <LayoutDashboard className="h-3.5 w-3.5 text-gray-400" />
                            {t("Show as a widget on the home screen")}
                        </Label>
                    </div>
                    {latestHtmlRunId && (
                        <a
                            className="inline-flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400 hover:underline"
                            href={`/automations/${form.slug || automationId}/runs/${latestHtmlRunId}`}
                        >
                            <ExternalLink className="h-4 w-4" />
                            {t("View latest HTML output")}
                        </a>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {t("Supporting files")}
                        </CardTitle>
                        {automationId && (
                            <>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (file) {
                                            onUploadFile(file);
                                        }
                                        event.target.value = "";
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                >
                                    <Upload className="me-1.5 h-3.5 w-3.5" />
                                    {t("Upload")}
                                </Button>
                            </>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-2">
                    {files.length === 0 ? (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {t("No supporting files.")}
                        </div>
                    ) : (
                        files.map((file) => {
                            const filename =
                                file.filename || file.name?.split("/").pop();
                            return (
                                <div
                                    key={file.name || file.filename}
                                    className="flex items-center justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2"
                                >
                                    <div className="flex min-w-0 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                        <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                                        <span className="truncate">
                                            {filename}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onDeleteFile(filename)}
                                        title={t("Delete")}
                                    >
                                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                                    </Button>
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>

            {automationId && (
                <Card className="border-red-200 dark:border-red-900/40">
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-base font-semibold text-red-700 dark:text-red-300">
                            {t("Danger zone")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={onDelete}
                            disabled={isDeleting}
                        >
                            <Trash2 className="me-1.5 h-4 w-4" />
                            {t("Delete automation")}
                        </Button>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            {t(
                                "Deleting an automation removes all of its history and supporting files.",
                            )}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
