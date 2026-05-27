"use client";

import { useTranslation } from "react-i18next";
import { Loader2, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import MarkdownEditor from "../../../../app/workspaces/components/MarkdownEditor";
import ScheduleSummary from "../ScheduleSummary";
import RunHistory from "../RunHistory";

export default function OverviewTab({
    form,
    onFieldChange,
    automationId,
    nextRunAt,
    runs,
    runsQuery,
    onRunNow,
    isRunning,
}) {
    const { t } = useTranslation();

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="p-4 pb-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                {t("Details")}
                            </CardTitle>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="overview-name" className="text-xs">
                            {t("Name")}
                        </Label>
                        <Input
                            id="overview-name"
                            value={form.name}
                            onChange={(e) =>
                                onFieldChange("name", e.target.value)
                            }
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label
                            htmlFor="overview-description"
                            className="text-xs"
                        >
                            {t("Short description")}
                        </Label>
                        <Textarea
                            id="overview-description"
                            value={form.description}
                            onChange={(e) =>
                                onFieldChange("description", e.target.value)
                            }
                            placeholder={t("Optional one-liner")}
                            className="min-h-[60px]"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {t("Schedule")}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-4">
                    <ScheduleSummary
                        schedule={form.schedule}
                        timezone={form.timezone}
                        nextRunAt={nextRunAt}
                        enabled={form.enabled}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="overview-enabled"
                                checked={form.enabled}
                                onCheckedChange={(checked) =>
                                    onFieldChange("enabled", Boolean(checked))
                                }
                                disabled={form.schedule?.frequency === "manual"}
                            />
                            <Label
                                htmlFor="overview-enabled"
                                className="text-sm font-normal text-gray-700 dark:text-gray-300"
                            >
                                {t("Enabled")}
                            </Label>
                        </div>
                        {automationId && (
                            <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={onRunNow}
                                disabled={isRunning}
                                className="min-h-10 bg-sky-600 text-white shadow-sm shadow-sky-900/10 hover:bg-sky-700 focus-visible:ring-sky-500 disabled:bg-sky-500 disabled:text-white disabled:opacity-90 dark:bg-sky-500 dark:hover:bg-sky-400 dark:disabled:bg-sky-600"
                            >
                                {isRunning ? (
                                    <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
                                ) : (
                                    <Play className="me-1.5 h-4 w-4" />
                                )}
                                {t("Run now")}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {t("Prompt")}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                    <MarkdownEditor
                        value={form.content}
                        onChange={(value) => onFieldChange("content", value)}
                        placeholder={t(
                            "Describe what Concierge should do when this automation runs.",
                        )}
                    />
                </CardContent>
            </Card>

            {automationId && (
                <RunHistory
                    runs={runs}
                    automationId={automationId}
                    hasMore={runsQuery.hasNextPage}
                    isLoadingMore={runsQuery.isFetchingNextPage}
                    onLoadMore={() => runsQuery.fetchNextPage()}
                />
            )}
        </div>
    );
}
