"use client";

import PageHeader from "../../layout/PageHeader";
import { HeaderAction } from "../../layout/HeaderControls";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { LanguageContext } from "../../contexts/LanguageProvider.js";
import { useTranslation } from "react-i18next";
import {
    ArrowLeft,
    Loader2,
    Save,
    Settings2,
    Sliders,
    Zap,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import classNames from "../../../app/utils/class-names";
import OverviewTab from "./tabs/OverviewTab";
import ScheduleTab from "./tabs/ScheduleTab";
import AdvancedTab from "./tabs/AdvancedTab";
import {
    useAutomation,
    useAutomationRuns,
    useDeleteAutomation,
    useDeleteAutomationFile,
    useRunAutomation,
    useUpdateAutomation,
    useUploadAutomationFile,
} from "../../hooks/useAutomations";
import { hasHtmlOutput } from "./runUtils";
import ShareButton from "@/components/share/ShareButton";
import { retainedRunLimit } from "../../utils/taskOutputRetention.js";

const EMPTY_CONTENT = `# Task\n\nDescribe what your colleague should do for this task.\n`;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ACTIVE_RUN_STATUSES = new Set(["pending", "in_progress", "waiting"]);

function getMutationErrorMessage(err, fallback) {
    const data = err?.response?.data;
    if (Array.isArray(data?.details) && data.details.length > 0) {
        return `${data.error || fallback}: ${data.details.join("; ")}`;
    }
    return data?.error || err?.message || fallback;
}

const DEFAULT_FORM = {
    name: "",
    slug: "",
    description: "",
    enabled: false,
    producesHtml: false,
    retainedRuns: 30,
    pinnedToHome: false,
    timezone: "UTC",
    schedule: {
        frequency: "manual",
        interval: 1,
        time: "09:00",
        times: ["09:00"],
        dayOfWeek: 1,
        daysOfWeek: [1],
        hourlyMode: "interval",
        minute: 0,
    },
    content: EMPTY_CONTENT,
};

function normalizeFormSchedule(schedule = {}) {
    let times = Array.isArray(schedule.times)
        ? schedule.times.filter((time) => TIME_PATTERN.test(time))
        : [];
    if (times.length === 0 && TIME_PATTERN.test(schedule.time || "")) {
        times.push(schedule.time);
    }
    if (times.length === 0) {
        times.push("09:00");
    }
    times = [...new Set(times)].sort();

    let daysOfWeek = Array.isArray(schedule.daysOfWeek)
        ? schedule.daysOfWeek
              .map((day) => Number.parseInt(day, 10))
              .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [];
    const parsedDay = Number.parseInt(schedule.dayOfWeek, 10);
    if (
        daysOfWeek.length === 0 &&
        Number.isInteger(parsedDay) &&
        parsedDay >= 0 &&
        parsedDay <= 6
    ) {
        daysOfWeek.push(parsedDay);
    }
    if (daysOfWeek.length === 0) {
        daysOfWeek.push(1);
    }
    daysOfWeek = [...new Set(daysOfWeek)].sort((a, b) => a - b);

    const minute = Number.parseInt(schedule.minute, 10);

    return {
        ...DEFAULT_FORM.schedule,
        watchPath: schedule.watchPath || "",
        ...schedule,
        times,
        time: times[0],
        daysOfWeek,
        dayOfWeek: daysOfWeek[0],
        hourlyMode: schedule.hourlyMode === "clock" ? "clock" : "interval",
        minute:
            Number.isInteger(minute) && minute >= 0 && minute <= 59
                ? minute
                : 0,
    };
}

function buildPayload(form) {
    return {
        entityId: form.entityId || null,
        name: form.name || "",
        slug: form.slug || "",
        description: form.description || "",
        enabled: Boolean(form.enabled),
        schedule: normalizeFormSchedule(form.schedule),
        timezone: form.timezone || "UTC",
        producesHtml: Boolean(form.producesHtml),
        retainedRuns: retainedRunLimit(form.retainedRuns),
        pinnedToHome: Boolean(form.pinnedToHome),
        content: form.content || "",
    };
}

export default function AutomationEditor({
    selectedId,
    onDeleted,
    onDone,
    headerInApp = false,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [form, setForm] = useState(DEFAULT_FORM);
    const [baseline, setBaseline] = useState(buildPayload(DEFAULT_FORM));
    const [error, setError] = useState("");
    const [uploadError, setUploadError] = useState("");
    const [activeTab, setActiveTab] = useState("overview");
    const hydratedIdRef = useRef(null);

    const { data: automation, isLoading } = useAutomation(selectedId);
    const runsQuery = useAutomationRuns(selectedId);
    const runs = useMemo(
        () => runsQuery.data?.pages?.flatMap((page) => page.runs || []) || [],
        [runsQuery.data],
    );
    const updateAutomation = useUpdateAutomation(selectedId);
    const deleteAutomation = useDeleteAutomation();
    const runAutomation = useRunAutomation(selectedId);
    const uploadFile = useUploadAutomationFile(selectedId);
    const deleteFile = useDeleteAutomationFile(selectedId);

    useEffect(() => {
        if (automation && automation._id !== hydratedIdRef.current) {
            const loaded = {
                ...DEFAULT_FORM,
                ...automation,
                schedule: normalizeFormSchedule(automation.schedule),
                content: automation.content ?? EMPTY_CONTENT,
            };
            setForm(loaded);
            setBaseline(buildPayload(loaded));
            hydratedIdRef.current = automation._id;
            setActiveTab("overview");
            setUploadError("");
        }
    }, [automation]);

    const latestHtmlRun = useMemo(
        () => runs.find((run) => hasHtmlOutput(run)),
        [runs],
    );
    const hasActiveRun = useMemo(
        () => runs.some((run) => ACTIVE_RUN_STATUSES.has(run.status)),
        [runs],
    );

    const readOnly = Boolean(automation?.readOnly);
    const isOwner = automation?.isOwner === true;

    const updateField = (key, value) => {
        if (readOnly) return;
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const replaceSchedule = (schedule) => {
        if (readOnly) return;
        setForm((prev) => ({
            ...prev,
            schedule: normalizeFormSchedule(schedule),
        }));
    };

    const updateScheduleField = (key, value) => {
        if (readOnly) return;
        setForm((prev) => ({
            ...prev,
            schedule: normalizeFormSchedule({
                ...prev.schedule,
                [key]: value,
            }),
        }));
    };

    const updateScheduleTime = (index, value) => {
        if (readOnly) return;
        setForm((prev) => {
            const times = [...(prev.schedule.times || ["09:00"])];
            times[index] = value;
            return {
                ...prev,
                schedule: normalizeFormSchedule({ ...prev.schedule, times }),
            };
        });
    };

    const addScheduleTime = () => {
        if (readOnly) return;
        setForm((prev) => ({
            ...prev,
            schedule: normalizeFormSchedule({
                ...prev.schedule,
                times: [...(prev.schedule.times || ["09:00"]), "17:00"],
            }),
        }));
    };

    const removeScheduleTime = (index) => {
        if (readOnly) return;
        setForm((prev) => ({
            ...prev,
            schedule: normalizeFormSchedule({
                ...prev.schedule,
                times: (prev.schedule.times || ["09:00"]).filter(
                    (_time, i) => i !== index,
                ),
            }),
        }));
    };

    const toggleScheduleDay = (day) => {
        if (readOnly) return;
        setForm((prev) => {
            const days = prev.schedule.daysOfWeek || [1];
            const next = days.includes(day)
                ? days.filter((value) => value !== day)
                : [...days, day];
            return {
                ...prev,
                schedule: normalizeFormSchedule({
                    ...prev.schedule,
                    daysOfWeek: next,
                }),
            };
        });
    };

    const currentPayload = useMemo(() => buildPayload(form), [form]);
    const isDirty = useMemo(
        () => JSON.stringify(currentPayload) !== JSON.stringify(baseline),
        [baseline, currentPayload],
    );
    const isSaving = updateAutomation.isPending;

    const handleSave = async () => {
        if (readOnly || !isDirty || isSaving) return;
        setError("");
        try {
            await updateAutomation.mutateAsync(currentPayload);
            setBaseline(currentPayload);
        } catch (err) {
            setError(err?.response?.data?.error || err.message);
        }
    };

    const handleDelete = async () => {
        if (!selectedId || !isOwner) return;
        if (!window.confirm(t("Delete this automation?"))) return;
        setError("");
        try {
            await deleteAutomation.mutateAsync(selectedId);
            onDeleted();
        } catch (err) {
            setError(getMutationErrorMessage(err, t("Failed")));
        }
    };

    const handleUploadFile = async (file) => {
        if (!file) return;
        setUploadError("");
        try {
            await uploadFile.mutateAsync(file);
        } catch (err) {
            setUploadError(getMutationErrorMessage(err, t("Upload failed")));
        }
    };

    const handleDeleteFile = async (filename) => {
        if (!filename) return;
        setError("");
        try {
            await deleteFile.mutateAsync(filename);
        } catch (err) {
            setError(getMutationErrorMessage(err, t("Failed")));
        }
    };

    if (isLoading || !automation) {
        return (
            <div className="flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div
                className={
                    headerInApp
                        ? ""
                        : "rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
                }
            >
                <PageHeader
                    title={form.name || t("Automation")}
                    description={form.description}
                    enabled={headerInApp}
                >
                    <Badge
                        variant={form.enabled ? "default" : "secondary"}
                        className={classNames(
                            form.enabled &&
                                "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-200",
                        )}
                    >
                        {form.enabled ? t("Enabled") : t("Disabled")}
                    </Badge>
                    {onDone && (
                        <HeaderAction
                            icon={ArrowLeft}
                            iconClassName="rtl:rotate-180"
                            label={t("Back to results")}
                            onClick={onDone}
                            data-testid="automation-done-editing-button"
                        />
                    )}
                    {isOwner && automation?._id && (
                        <ShareButton
                            entityType="automation"
                            entityId={automation._id}
                        />
                    )}
                    {!readOnly && (
                        <HeaderAction
                            icon={isSaving ? Loader2 : Save}
                            iconClassName={
                                isSaving ? "animate-spin" : undefined
                            }
                            label={t("Save changes")}
                            onClick={handleSave}
                            disabled={!isDirty || isSaving}
                            variant="default"
                        />
                    )}
                </PageHeader>

                {error && (
                    <div className="mt-4 rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}
            </div>

            <Tabs
                dir={direction}
                value={activeTab}
                onValueChange={setActiveTab}
            >
                <TabsList>
                    <TabsTrigger value="overview">
                        <Zap className="me-1.5 h-3.5 w-3.5" />
                        {t("Overview")}
                    </TabsTrigger>
                    <TabsTrigger value="schedule">
                        <Sliders className="me-1.5 h-3.5 w-3.5" />
                        {t("Schedule")}
                    </TabsTrigger>
                    <TabsTrigger value="advanced">
                        <Settings2 className="me-1.5 h-3.5 w-3.5" />
                        {t("Advanced")}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                    <OverviewTab
                        form={form}
                        onFieldChange={updateField}
                        automationId={selectedId}
                        nextRunAt={automation?.nextRunAt}
                        runs={runs}
                        runsQuery={runsQuery}
                        onRunNow={() => runAutomation.mutate()}
                        isRunning={runAutomation.isPending || hasActiveRun}
                        readOnly={readOnly}
                    />
                </TabsContent>
                <TabsContent value="schedule">
                    <ScheduleTab
                        form={form}
                        onScheduleReplace={replaceSchedule}
                        onScheduleField={updateScheduleField}
                        onScheduleTime={updateScheduleTime}
                        onScheduleTimeAdd={addScheduleTime}
                        onScheduleTimeRemove={removeScheduleTime}
                        onScheduleDayToggle={toggleScheduleDay}
                        onTimezoneChange={(value) =>
                            updateField("timezone", value)
                        }
                        nextRunAt={automation?.nextRunAt}
                        readOnly={readOnly}
                    />
                </TabsContent>
                <TabsContent value="advanced">
                    <AdvancedTab
                        form={form}
                        automation={automation}
                        automationId={selectedId}
                        onFieldChange={updateField}
                        latestHtmlRunId={latestHtmlRun?._id}
                        onUploadFile={handleUploadFile}
                        isUploading={uploadFile.isPending}
                        uploadError={uploadError}
                        onDeleteFile={handleDeleteFile}
                        onDelete={handleDelete}
                        isDeleting={deleteAutomation.isPending}
                        readOnly={readOnly}
                        canManage={isOwner}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
