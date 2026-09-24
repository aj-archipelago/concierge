"use client";

import { RefreshCw } from "lucide-react";
import PageHeader from "../../../src/layout/PageHeader";
import { HeaderAction } from "../../../src/layout/HeaderControls";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Fragment,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";
import { useModelMetadata } from "../../queries/modelMetadata";
import {
    buildPricingMap,
    computeRunRate,
    computeTotalTokens,
    computeUsageCost,
    getUsageCostDetails,
    getUsageDateRange,
} from "./usageMetrics";

import UsageCost, { formatCost } from "./UsageCost";
import { buildIntervalUsageCsv } from "./usageExport";

import WeeklyBudgetControl from "./WeeklyBudgetControl";
import BudgetPortal from "./BudgetPortal";

const DRILLDOWN_VIEW_OPTIONS = [
    { value: "chart", label: "Chart" },
    { value: "table", label: "Table" },
];

const DRILLDOWN_GRANULARITY_OPTIONS = [
    {
        value: "15m",
        label: "15 min",
        columnLabel: "15 Min (UTC)",
        descriptionLabel: "15-minute intervals",
    },
    {
        value: "hour",
        label: "1 hour",
        columnLabel: "Hour (UTC)",
        descriptionLabel: "hourly intervals",
    },
    {
        value: "day",
        label: "1 day",
        columnLabel: "Day (UTC)",
        descriptionLabel: "daily intervals",
    },
];

function useTableSort(defaultColumn, defaultDirection = "desc") {
    const [sort, setSort] = useState({
        column: defaultColumn,
        direction: defaultDirection,
    });
    const toggleSort = useCallback((column) => {
        setSort((prev) =>
            prev.column === column
                ? {
                      column,
                      direction: prev.direction === "asc" ? "desc" : "asc",
                  }
                : { column, direction: "desc" },
        );
    }, []);
    return { sort, toggleSort };
}

function sortRows(rows, sort, getValue) {
    if (!rows?.length) return [];
    return [...rows].sort((a, b) => {
        const va = getValue(a, sort.column);
        const vb = getValue(b, sort.column);
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return sort.direction === "asc" ? cmp : -cmp;
    });
}

function SortableHead({ column, label, sort, onToggle, className = "" }) {
    const active = sort.column === column;
    return (
        <TableHead
            className={`cursor-pointer select-none hover:text-foreground ${className}`}
            onClick={() => onToggle(column)}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                <span className="text-xs opacity-40">
                    {active
                        ? sort.direction === "asc"
                            ? "\u25B2"
                            : "\u25BC"
                        : "\u25B6"}
                </span>
            </span>
        </TableHead>
    );
}

function formatNumber(n) {
    if (n == null) return "0";
    return n.toLocaleString();
}

function getApiKeyLabel(apiKeyId, keyMappings) {
    if (apiKeyId == null || apiKeyId === "") return "none";
    return keyMappings?.[apiKeyId] || apiKeyId;
}

function renderApiKeyCell(apiKeyId, keyMappings) {
    if (apiKeyId == null || apiKeyId === "") {
        return <span className="font-mono text-sm">none</span>;
    }

    if (keyMappings?.[apiKeyId]) {
        return (
            <span>
                {keyMappings[apiKeyId]}{" "}
                <span className="text-muted-foreground font-mono text-xs">
                    ({apiKeyId})
                </span>
            </span>
        );
    }

    return <span className="font-mono text-sm">{apiKeyId}</span>;
}

function getGranularityOption(value) {
    return (
        DRILLDOWN_GRANULARITY_OPTIONS.find(
            (option) => option.value === value,
        ) || DRILLDOWN_GRANULARITY_OPTIONS[1]
    );
}

function formatCompactNumber(n) {
    if (n == null) return "0";
    return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(n);
}

function getBucketDate(bucketLabel, granularity) {
    if (!bucketLabel) return null;

    const isoValue =
        granularity === "day"
            ? `${bucketLabel}T00:00:00.000Z`
            : `${bucketLabel.replace(" ", "T")}:00.000Z`;
    const parsed = new Date(isoValue);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatBucketLabel(bucketLabel, granularity) {
    const parsed = getBucketDate(bucketLabel, granularity);
    if (!parsed) return bucketLabel || "—";

    const formatOptions =
        granularity === "day"
            ? {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
              }
            : {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "UTC",
              };

    return new Intl.DateTimeFormat("en-US", formatOptions).format(parsed);
}

function getModelBreakdownName(row) {
    if (typeof row?.model === "string" && row.model) return row.model;
    if (typeof row?._id === "string" && row._id) return row._id;
    if (typeof row?._id?.model === "string" && row._id.model) {
        return row._id.model;
    }
    return "unknown";
}

function getSortedModelBreakdownRows(row) {
    if (
        !Array.isArray(row?.model_breakdown) ||
        row.model_breakdown.length === 0
    ) {
        return [];
    }

    return [...row.model_breakdown].sort((a, b) => {
        const tokenDelta = computeTotalTokens(b) - computeTotalTokens(a);
        if (tokenDelta !== 0) return tokenDelta;

        return getModelBreakdownName(a).localeCompare(getModelBreakdownName(b));
    });
}

function formatShare(part, total) {
    if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
        return "0%";
    }

    return `${((part / total) * 100).toFixed(1)}%`;
}

function ApiKeyModelBreakdown({ row, pricingMap }) {
    const breakdownRows = getSortedModelBreakdownRows(row);

    if (breakdownRows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No model breakout is available for this API key.
            </p>
        );
    }

    const totalTokens = computeTotalTokens(row);

    return (
        <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Model breakout</p>
                <p className="text-xs text-muted-foreground">
                    {breakdownRows.length} models, {formatNumber(totalTokens)}{" "}
                    total tokens
                </p>
            </div>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Model</TableHead>
                            <TableHead className="text-right">
                                Requests
                            </TableHead>
                            <TableHead className="text-right">Input</TableHead>
                            <TableHead className="text-right">Output</TableHead>
                            <TableHead className="text-right">
                                Cache Write
                            </TableHead>
                            <TableHead className="text-right">
                                Cache Read
                            </TableHead>
                            <TableHead className="text-right">
                                Total Tokens
                            </TableHead>
                            <TableHead className="text-right">Share</TableHead>
                            <TableHead className="text-right">
                                Est. Cost
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {breakdownRows.map((modelRow) => {
                            const modelName = getModelBreakdownName(modelRow);
                            const modelTokens = computeTotalTokens(modelRow);
                            const costDetails = getUsageCostDetails(
                                modelRow,
                                pricingMap,
                            );

                            return (
                                <TableRow key={modelName}>
                                    <TableCell className="font-medium">
                                        {modelName}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatNumber(modelRow.requests)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatNumber(modelRow.input_tokens)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatNumber(modelRow.output_tokens)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatNumber(
                                            modelRow.cache_creation_input_tokens,
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatNumber(
                                            modelRow.cache_read_input_tokens,
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatNumber(modelTokens)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatShare(modelTokens, totalTokens)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <UsageCost details={costDetails} />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

function getGranularityMs(granularity) {
    switch (granularity) {
        case "15m":
            return 15 * 60 * 1000;
        case "day":
            return 24 * 60 * 60 * 1000;
        case "hour":
        default:
            return 60 * 60 * 1000;
    }
}

function floorDateToGranularity(date, granularity) {
    const floored = new Date(date);
    if (Number.isNaN(floored.getTime())) return null;

    if (granularity === "day") {
        floored.setUTCHours(0, 0, 0, 0);
        return floored;
    }

    if (granularity === "15m") {
        floored.setUTCMinutes(
            floored.getUTCMinutes() - (floored.getUTCMinutes() % 15),
            0,
            0,
        );
        return floored;
    }

    floored.setUTCMinutes(0, 0, 0);
    return floored;
}

function formatBucketKey(date, granularity) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    if (granularity === "day") {
        return `${year}-${month}-${day}`;
    }

    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute =
        granularity === "15m"
            ? String(date.getUTCMinutes()).padStart(2, "0")
            : "00";

    return `${year}-${month}-${day} ${hour}:${minute}`;
}

function buildZeroUsageRow(bucketKey) {
    return {
        _id: bucketKey,
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        total_tokens: 0,
    };
}

function fillMissingIntervals(rows, startDate, endDate, granularity) {
    if (!startDate || !endDate) return Array.isArray(rows) ? rows : [];

    const start = floorDateToGranularity(new Date(startDate), granularity);
    const end = floorDateToGranularity(new Date(endDate), granularity);
    if (!start || !end || start > end) {
        return Array.isArray(rows) ? rows : [];
    }

    const intervalMs = getGranularityMs(granularity);
    const rowMap = new Map((rows || []).map((row) => [row._id, row]));
    const filledRows = [];

    for (
        let cursor = new Date(start);
        cursor <= end;
        cursor = new Date(cursor.getTime() + intervalMs)
    ) {
        const bucketKey = formatBucketKey(cursor, granularity);
        filledRows.push(rowMap.get(bucketKey) || buildZeroUsageRow(bucketKey));
    }

    return filledRows;
}

function getDisplayCost(row, pricingMap) {
    const cost = computeUsageCost(row, pricingMap);
    if (cost != null) return cost;

    return computeTotalTokens(row) === 0 && (row?.requests || 0) === 0
        ? 0
        : null;
}

function sanitizeFilePart(value) {
    const normalized = String(value || "unknown")
        .trim()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();

    return normalized || "unknown";
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function UsageTrendChart({ rows, granularity, pricingMap }) {
    const { t } = useTranslation();
    const costDetails = getUsageCostDetails(
        {
            model_breakdown: (rows || []).flatMap((row) =>
                row.model_breakdown?.length ? row.model_breakdown : [row],
            ),
        },
        pricingMap,
    );
    if (!rows?.length) {
        return (
            <p className="text-sm text-muted-foreground">
                No chart data for this interval selection.
            </p>
        );
    }

    const width = 920;
    const height = 280;
    const margin = { top: 16, right: 20, bottom: 40, left: 56 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const points = rows.map((row, index) => ({
        index,
        bucket: row._id || "",
        totalTokens: computeTotalTokens(row),
        requests: row.requests || 0,
    }));
    const maxTokens = Math.max(...points.map((point) => point.totalTokens), 1);
    const gridValues = Array.from(
        { length: 4 },
        (_, index) => (maxTokens / 3) * index,
    );
    const xForIndex =
        points.length === 1
            ? () => margin.left + chartWidth / 2
            : (index) =>
                  margin.left + (index / (points.length - 1)) * chartWidth;
    const yForValue = (value) =>
        margin.top + chartHeight - (value / maxTokens) * chartHeight;
    const chartPoints = points.map((point) => ({
        ...point,
        x: xForIndex(point.index),
        y: yForValue(point.totalTokens),
    }));
    const linePath = chartPoints
        .map(
            (point, index) =>
                `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
        )
        .join(" ");
    const areaPath =
        chartPoints.length > 1
            ? [
                  `M ${chartPoints[0].x} ${margin.top + chartHeight}`,
                  `L ${chartPoints[0].x} ${chartPoints[0].y}`,
                  ...chartPoints
                      .slice(1)
                      .map((point) => `L ${point.x} ${point.y}`),
                  `L ${chartPoints[chartPoints.length - 1].x} ${margin.top + chartHeight}`,
                  "Z",
              ].join(" ")
            : null;
    const xLabelStep = Math.max(1, Math.ceil(chartPoints.length / 4));
    const xLabelIndices = new Set(
        chartPoints.flatMap((_, index) => {
            if (index === 0 || index === chartPoints.length - 1) {
                return [index];
            }

            return index % xLabelStep === 0 ? [index] : [];
        }),
    );
    const peakPoint = chartPoints.reduce((best, point) =>
        point.totalTokens > best.totalTokens ? point : best,
    );

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Peak Tokens
                    </p>
                    <p className="text-lg font-semibold">
                        {formatNumber(peakPoint.totalTokens)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {formatBucketLabel(peakPoint.bucket, granularity)}
                    </p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Total Requests
                    </p>
                    <p className="text-lg font-semibold">
                        {formatNumber(
                            chartPoints.reduce(
                                (total, point) => total + point.requests,
                                0,
                            ),
                        )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Across {chartPoints.length} buckets
                    </p>
                </div>
                <div
                    role="group"
                    aria-label={t("usageDashboard.estimatedCost")}
                    className="rounded-md border bg-muted/20 p-3"
                >
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t("usageDashboard.estimatedCost")}
                    </p>
                    <p className="text-lg font-semibold">
                        <UsageCost details={costDetails} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Chart plots total tokens per bucket
                    </p>
                </div>
            </div>

            <div className="rounded-md border bg-white p-3 dark:bg-gray-900/20">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-[280px] w-full"
                    role="img"
                    aria-label="Token usage trend chart"
                >
                    <defs>
                        <linearGradient
                            id="usage-trend-fill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="#0ea5e9"
                                stopOpacity="0.28"
                            />
                            <stop
                                offset="100%"
                                stopColor="#0ea5e9"
                                stopOpacity="0.04"
                            />
                        </linearGradient>
                    </defs>

                    {gridValues.map((value) => {
                        const y = yForValue(value);

                        return (
                            <g key={value}>
                                <line
                                    x1={margin.left}
                                    x2={margin.left + chartWidth}
                                    y1={y}
                                    y2={y}
                                    stroke="currentColor"
                                    strokeOpacity="0.12"
                                />
                                <text
                                    x={margin.left - 10}
                                    y={y + 4}
                                    textAnchor="end"
                                    fontSize="11"
                                    fill="currentColor"
                                    opacity="0.6"
                                >
                                    {formatCompactNumber(value)}
                                </text>
                            </g>
                        );
                    })}

                    {areaPath && (
                        <path d={areaPath} fill="url(#usage-trend-fill)" />
                    )}
                    <path
                        d={linePath}
                        fill="none"
                        stroke="#0284c7"
                        strokeWidth="3"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />

                    {chartPoints.map((point, index) => (
                        <g key={`${point.bucket}-${index}`}>
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r="4"
                                fill="#0284c7"
                                stroke="white"
                                strokeWidth="2"
                            />
                            {xLabelIndices.has(index) && (
                                <text
                                    x={point.x}
                                    y={height - 12}
                                    textAnchor="middle"
                                    fontSize="11"
                                    fill="currentColor"
                                    opacity="0.65"
                                >
                                    {formatBucketLabel(
                                        point.bucket,
                                        granularity,
                                    )}
                                </text>
                            )}
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    );
}

async function fetchUsage(startDate, endDate, groupBy, filters = {}, signal) {
    const params = new URLSearchParams({ startDate, endDate, groupBy });

    for (const [key, value] of Object.entries(filters)) {
        if (value != null && value !== "") {
            params.set(key, value);
        }
    }

    const res = await fetch(`/api/admin/usage?${params}`, { signal });
    if (!res.ok) throw new Error("Failed to fetch usage data");
    return res.json();
}

async function fetchKeyMappings() {
    const res = await fetch("/api/admin/usage/key-mappings");
    if (!res.ok) throw new Error("Unable to load key labels");
    return res.json();
}

export default function UsagePage() {
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext);
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("budgets");
    const [refreshTime, setRefreshTime] = useState(() => new Date());
    const [dateRange, setDateRange] = useState("7d");
    const [selectedKeyId, setSelectedKeyId] = useState(null);
    const [selectedDrilldownView, setSelectedDrilldownView] = useState("chart");
    const [selectedGranularity, setSelectedGranularity] = useState("hour");
    const [expandedKeyIds, setExpandedKeyIds] = useState([]);
    const hourlyDrilldownRef = useRef(null);
    const { data: modelData } = useModelMetadata();
    const modelSort = useTableSort("cost");
    const keySort = useTableSort("total_tokens");
    const daySort = useTableSort("_id", "asc");
    const intervalSort = useTableSort("_id", "asc");

    const { startDate, endDate } = useMemo(
        () => getUsageDateRange(dateRange, refreshTime),
        [dateRange, refreshTime],
    );

    const pricingMap = useMemo(
        () => buildPricingMap(modelData?.models),
        [modelData],
    );

    const {
        data: overview,
        isLoading: loadingOverview,
        error: overviewError,
    } = useQuery({
        queryKey: ["usage", "overview", startDate, endDate],
        queryFn: ({ signal }) =>
            fetchUsage(startDate, endDate, "overview", {}, signal),
        staleTime: 60_000,
        retry: false,
        refetchOnWindowFocus: false,
        enabled: activeTab !== "budgets",
    });
    const { byModel, byKey, byDay } = overview || {};
    const loadingModel = loadingOverview;
    const loadingKey = loadingOverview;
    const loadingDay = loadingOverview;

    const {
        data: keyMappings,
        error: labelsError,
        refetch: refreshMappings,
    } = useQuery({
        queryKey: ["usage", "key-mappings"],
        queryFn: fetchKeyMappings,
        staleTime: 60_000,
        retry: false,
    });

    const {
        data: bySelectedKeyInterval,
        isLoading: loadingSelectedKeyInterval,
        error: intervalError,
    } = useQuery({
        queryKey: [
            "usage",
            selectedGranularity,
            startDate,
            endDate,
            selectedKeyId,
        ],
        queryFn: ({ signal }) =>
            fetchUsage(
                startDate,
                endDate,
                selectedGranularity,
                {
                    apiKeyId: selectedKeyId,
                },
                signal,
            ),
        staleTime: 60_000,
        retry: false,
        refetchOnWindowFocus: false,
        enabled: Boolean(selectedKeyId) && activeTab === "by-key",
    });

    const {
        data: limits,
        error: limitsError,
        refetch: refreshLimits,
        isLoading: loadingLimits,
        isFetching: refreshingLimits,
    } = useQuery({
        queryKey: ["usage", "limits"],
        queryFn: async ({ signal }) => {
            const response = await fetch("/api/admin/usage/limits", { signal });
            if (!response.ok) throw new Error("Unable to load limits");
            return response.json();
        },
        staleTime: 15_000,
        refetchInterval: 30_000,
        retry: false,
    });

    const handleBudgetSaved = useCallback(
        async (apiKeyId, weeklyUsd) => {
            queryClient.setQueryData(["usage", "limits"], (previous) =>
                previous
                    ? {
                          ...previous,
                          budgets: {
                              ...previous.budgets,
                              [apiKeyId]: {
                                  ...previous.budgets?.[apiKeyId],
                                  apiKeyId,
                                  weeklyUsd,
                              },
                          },
                      }
                    : previous,
            );
            await refreshLimits();
        },
        [queryClient, refreshLimits],
    );
    const handleRefresh = useCallback(() => {
        setRefreshTime(new Date());
        refreshLimits();
        refreshMappings();
    }, [refreshLimits, refreshMappings]);

    // Compute summary stats
    const summary = useMemo(() => {
        if (!byModel) return null;

        const costDetails = getUsageCostDetails(
            { model_breakdown: byModel },
            pricingMap,
        );
        const totalCost = costDetails.cost;
        const unpricedRequests = costDetails.unpricedRequests;
        const unpricedModelCount = costDetails.unpricedModels.length;
        let totalRequests = 0;
        let totalTokens = 0;
        let topModel = null;
        let topModelCost = null;
        let topModelComplete = true;

        for (const row of byModel) {
            const details = getUsageCostDetails(row, pricingMap);
            const cost = details.cost;
            totalRequests += row.requests || 0;
            totalTokens += computeTotalTokens(row);
            if (cost != null && (topModelCost == null || cost > topModelCost)) {
                topModelCost = cost;
                topModel = row._id;
                topModelComplete = details.complete;
            }
        }

        const topKeyRow =
            byKey?.reduce((best, row) => {
                if (!best) return row;
                return computeTotalTokens(row) > computeTotalTokens(best)
                    ? row
                    : best;
            }, null) || null;

        return {
            totalCost,
            costDetails,
            unpricedRequests,
            unpricedModelCount,
            totalRequests,
            totalTokens,
            totalRunRate: computeRunRate(totalCost, startDate, endDate),
            topModel,
            topModelCost,
            topModelComplete,
            topKeyId: topKeyRow?._id || null,
            topKeyTokens: topKeyRow ? computeTotalTokens(topKeyRow) : 0,
        };
    }, [byKey, byModel, endDate, pricingMap, startDate]);

    const sortedByModel = useMemo(
        () =>
            sortRows(byModel, modelSort.sort, (row, col) =>
                col === "cost"
                    ? computeUsageCost(row, pricingMap) || 0
                    : col === "run_rate"
                      ? computeRunRate(
                            computeUsageCost(row, pricingMap) || 0,
                            startDate,
                            endDate,
                        ) || 0
                      : col === "total_tokens"
                        ? computeTotalTokens(row)
                        : col === "_id"
                          ? (row._id || "").toLowerCase()
                          : row[col] || 0,
            ),
        [byModel, endDate, modelSort.sort, pricingMap, startDate],
    );

    const keysWithBudgets = useMemo(() => {
        const rows = new Map((byKey || []).map((row) => [row._id, row]));
        for (const id of [
            ...Object.keys(keyMappings || {}),
            ...Object.keys(limits?.budgets || {}),
        ]) {
            if (!rows.has(id))
                rows.set(id, { _id: id, requests: 0, metered_tokens: 0 });
        }
        return [...rows.values()];
    }, [byKey, keyMappings, limits]);

    const sortedByKey = useMemo(
        () =>
            sortRows(keysWithBudgets, keySort.sort, (row, col) =>
                col === "cost"
                    ? computeUsageCost(row, pricingMap) || 0
                    : col === "run_rate"
                      ? computeRunRate(
                            computeUsageCost(row, pricingMap) || 0,
                            startDate,
                            endDate,
                        ) || 0
                      : col === "total_tokens"
                        ? computeTotalTokens(row)
                        : col === "_id"
                          ? (
                                keyMappings?.[row._id] ||
                                row._id ||
                                ""
                            ).toLowerCase()
                          : row[col] || 0,
            ),
        [
            keysWithBudgets,
            endDate,
            keyMappings,
            keySort.sort,
            pricingMap,
            startDate,
        ],
    );

    const sortedByDay = useMemo(
        () =>
            sortRows(byDay, daySort.sort, (row, col) =>
                col === "cost"
                    ? computeUsageCost(row, pricingMap) || 0
                    : col === "total_tokens"
                      ? computeTotalTokens(row)
                      : col === "_id"
                        ? row._id || ""
                        : row[col] || 0,
            ),
        [byDay, daySort.sort, pricingMap],
    );

    const selectedKeySummary = useMemo(
        () =>
            byKey?.find((row) =>
                row?._id == null
                    ? selectedKeyId == null
                    : row._id === selectedKeyId,
            ) || null,
        [byKey, selectedKeyId],
    );

    const selectedKeyLabel = useMemo(
        () => getApiKeyLabel(selectedKeyId, keyMappings),
        [keyMappings, selectedKeyId],
    );

    const selectedGranularityOption = useMemo(
        () => getGranularityOption(selectedGranularity),
        [selectedGranularity],
    );

    const zeroFilledSelectedKeyInterval = useMemo(() => {
        if (
            !selectedKeyId ||
            loadingSelectedKeyInterval ||
            !Array.isArray(bySelectedKeyInterval)
        ) {
            return [];
        }

        return fillMissingIntervals(
            bySelectedKeyInterval,
            startDate,
            endDate,
            selectedGranularity,
        );
    }, [
        bySelectedKeyInterval,
        endDate,
        loadingSelectedKeyInterval,
        selectedGranularity,
        selectedKeyId,
        startDate,
    ]);

    const chronologicalSelectedKeyInterval = useMemo(
        () =>
            sortRows(
                zeroFilledSelectedKeyInterval,
                { column: "_id", direction: "asc" },
                (row) => row._id || "",
            ),
        [zeroFilledSelectedKeyInterval],
    );

    const sortedBySelectedKeyInterval = useMemo(
        () =>
            sortRows(
                zeroFilledSelectedKeyInterval,
                intervalSort.sort,
                (row, col) =>
                    col === "cost"
                        ? getDisplayCost(row, pricingMap) || 0
                        : col === "total_tokens"
                          ? computeTotalTokens(row)
                          : col === "_id"
                            ? row._id || ""
                            : row[col] || 0,
            ),
        [intervalSort.sort, pricingMap, zeroFilledSelectedKeyInterval],
    );

    const scrollToHourlyDrilldown = useCallback(() => {
        const scroll = () =>
            hourlyDrilldownRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });

        if (
            typeof window !== "undefined" &&
            typeof window.requestAnimationFrame === "function"
        ) {
            window.requestAnimationFrame(scroll);
            return;
        }

        window.setTimeout(scroll, 0);
    }, []);

    const handleSelectKey = useCallback(
        (apiKeyId) => {
            if (!apiKeyId) return;
            setActiveTab("by-key");
            setSelectedKeyId(apiKeyId);
            scrollToHourlyDrilldown();
        },
        [scrollToHourlyDrilldown],
    );

    const handleToggleKeyExpansion = useCallback((apiKeyId) => {
        if (!apiKeyId) return;

        setExpandedKeyIds((prev) =>
            prev.includes(apiKeyId)
                ? prev.filter((id) => id !== apiKeyId)
                : [...prev, apiKeyId],
        );
    }, []);

    const handleExportHourlyCsv = useCallback(() => {
        if (!selectedKeyId || chronologicalSelectedKeyInterval.length === 0) {
            return;
        }

        const csv = buildIntervalUsageCsv(chronologicalSelectedKeyInterval, {
            apiKeyId: selectedKeyId,
            apiKeyLabel: selectedKeyLabel,
            pricingMap,
        });
        const filename = [
            "token-usage",
            sanitizeFilePart(selectedGranularity),
            sanitizeFilePart(selectedKeyId),
            sanitizeFilePart(startDate.slice(0, 10)),
            sanitizeFilePart(endDate.slice(0, 10)),
        ].join("-");

        downloadTextFile(`${filename}.csv`, csv, "text/csv;charset=utf-8");
    }, [
        endDate,
        pricingMap,
        selectedGranularity,
        selectedKeyId,
        selectedKeyLabel,
        chronologicalSelectedKeyInterval,
        startDate,
    ]);

    return (
        <div dir={direction} className="min-w-0 space-y-5">
            <PageHeader
                title={t("usageDashboard.portalTitle")}
                description={t("usageDashboard.portalDescription")}
            >
                <HeaderAction
                    icon={RefreshCw}
                    label={t("usageDashboard.refresh")}
                    onClick={handleRefresh}
                    disabled={refreshingLimits}
                />
                {activeTab !== "budgets" && (
                    <Select
                        value={dateRange}
                        onValueChange={(value) => {
                            setDateRange(value);
                            setRefreshTime(new Date());
                        }}
                    >
                        <SelectTrigger className="w-[140px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">
                                {t("usageDashboard.range.today")}
                            </SelectItem>
                            <SelectItem value="7d">
                                {t("usageDashboard.range.7d")}
                            </SelectItem>
                            <SelectItem value="30d">
                                {t("usageDashboard.range.30d")}
                            </SelectItem>
                            <SelectItem value="90d">
                                {t("usageDashboard.range.90d")}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                )}
            </PageHeader>

            {activeTab !== "budgets" && (
                <p className="mb-4 text-sm text-muted-foreground">
                    {t("usageDashboard.explanation")}
                </p>
            )}

            {overview && activeTab !== "budgets" && (
                <p className="mb-4 text-sm text-muted-foreground">
                    {t("usageDashboard.asOf", {
                        date: new Date(overview.endDate).toLocaleString(),
                    })}
                </p>
            )}
            {activeTab !== "budgets" &&
                (overviewError || intervalError || limitsError) && (
                    <p
                        role="alert"
                        className="mb-4 text-red-700 dark:text-red-300"
                    >
                        {t("usageDashboard.loadError")}
                    </p>
                )}
            {activeTab !== "budgets" && summary?.unpricedModelCount > 0 && (
                <p
                    role="status"
                    className="mb-4 break-words text-amber-800 dark:text-amber-200"
                >
                    {t("usageDashboard.unpriced", {
                        count: summary.unpricedRequests,
                    })}{" "}
                    {t("usageDashboard.unpricedModels", {
                        models: summary.costDetails.unpricedModels.join(", "),
                    })}
                </p>
            )}
            {/* Summary Cards */}
            {summary && !overviewError && activeTab !== "budgets" && (
                <div className="grid gap-4 mb-6 md:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>
                                {t(
                                    summary.unpricedModelCount
                                        ? "usageDashboard.pricedSubtotal"
                                        : "usageDashboard.estimatedCost",
                                )}
                            </CardDescription>
                            <CardTitle className="text-2xl">
                                <UsageCost details={summary.costDetails} />
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {t("usageDashboard.requestCount", {
                                    count: summary.totalRequests,
                                })}
                            </p>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>
                                {t("usageDashboard.runRateTitle")}
                            </CardDescription>
                            <CardTitle className="text-2xl">
                                <UsageCost
                                    details={summary.costDetails}
                                    value={summary.totalRunRate}
                                />
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {t("usageDashboard.selectedWindow")}
                            </p>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>
                                {t("usageDashboard.totalTokens")}
                            </CardDescription>
                            <CardTitle className="text-2xl">
                                {formatNumber(summary.totalTokens)}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {t("usageDashboard.topModel", {
                                    model: summary.topModel || "—",
                                    cost: `${formatCost(summary.topModelCost)}${summary.topModelComplete ? "" : ` · ${t("usageDashboard.partialCost")}`}`,
                                })}
                            </p>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>
                                {t("usageDashboard.topKey")}
                            </CardDescription>
                            <CardTitle className="text-2xl">
                                {summary.topKeyId
                                    ? keyMappings?.[summary.topKeyId] ||
                                      summary.topKeyId
                                    : "—"}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {t("usageDashboard.tokenCount", {
                                    count: summary.topKeyTokens,
                                })}
                            </p>
                        </CardHeader>
                    </Card>
                </div>
            )}

            <Tabs
                dir={direction}
                value={activeTab}
                onValueChange={setActiveTab}
            >
                <TabsList className="mb-4 h-auto max-w-full justify-start overflow-x-auto">
                    <TabsTrigger value="budgets" className="min-h-10">
                        {t("usageDashboard.budgetControl")}
                    </TabsTrigger>
                    <TabsTrigger value="by-model" className="min-h-10">
                        {t("usageDashboard.byModel")}
                    </TabsTrigger>
                    <TabsTrigger value="by-key" className="min-h-10">
                        {t("usageDashboard.byKey")}
                    </TabsTrigger>
                    <TabsTrigger value="by-day" className="min-h-10">
                        {t("usageDashboard.daily")}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="budgets">
                    <BudgetPortal
                        limits={limits}
                        keyMappings={keyMappings}
                        usage={byKey}
                        error={limitsError}
                        labelsError={labelsError}
                        loading={loadingLimits}
                        refreshing={refreshingLimits}
                        onRefresh={handleRefresh}
                        onSaved={handleBudgetSaved}
                        onInspect={handleSelectKey}
                    />
                </TabsContent>

                {/* By Model */}
                <TabsContent value="by-model">
                    <Card>
                        <CardHeader>
                            <CardTitle>Usage by Model</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loadingModel ? (
                                <p className="text-muted-foreground">
                                    Loading...
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <SortableHead
                                                    column="_id"
                                                    label="Model"
                                                    sort={modelSort.sort}
                                                    onToggle={
                                                        modelSort.toggleSort
                                                    }
                                                />
                                                <SortableHead
                                                    column="requests"
                                                    label="Requests"
                                                    sort={modelSort.sort}
                                                    onToggle={
                                                        modelSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="input_tokens"
                                                    label="Input"
                                                    sort={modelSort.sort}
                                                    onToggle={
                                                        modelSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="output_tokens"
                                                    label="Output"
                                                    sort={modelSort.sort}
                                                    onToggle={
                                                        modelSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cache_creation_input_tokens"
                                                    label="Cache Write"
                                                    sort={modelSort.sort}
                                                    onToggle={
                                                        modelSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cache_read_input_tokens"
                                                    label="Cache Read"
                                                    sort={modelSort.sort}
                                                    onToggle={
                                                        modelSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="total_tokens"
                                                    label="Total Tokens"
                                                    sort={modelSort.sort}
                                                    onToggle={
                                                        modelSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cost"
                                                    label="Est. Cost"
                                                    sort={modelSort.sort}
                                                    onToggle={
                                                        modelSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="run_rate"
                                                    label="30d Run Rate"
                                                    sort={modelSort.sort}
                                                    onToggle={
                                                        modelSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedByModel.map((row) => {
                                                const costDetails =
                                                    getUsageCostDetails(
                                                        row,
                                                        pricingMap,
                                                    );
                                                const cost = costDetails.cost;
                                                const runRate = computeRunRate(
                                                    cost,
                                                    startDate,
                                                    endDate,
                                                );
                                                return (
                                                    <TableRow key={row._id}>
                                                        <TableCell className="font-medium">
                                                            {row._id}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.requests,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.input_tokens,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.output_tokens,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.cache_creation_input_tokens,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.cache_read_input_tokens,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                computeTotalTokens(
                                                                    row,
                                                                ),
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            <UsageCost
                                                                details={
                                                                    costDetails
                                                                }
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right text-muted-foreground">
                                                            <UsageCost
                                                                details={
                                                                    costDetails
                                                                }
                                                                value={runRate}
                                                                per30Days
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                            {sortedByModel.length === 0 && (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={9}
                                                        className="text-center text-muted-foreground"
                                                    >
                                                        No usage data for this
                                                        period
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* By API Key */}
                <TabsContent value="by-key">
                    <Card>
                        <CardHeader>
                            <CardTitle>Usage by API Key</CardTitle>
                            <CardDescription>
                                Select a row to drill into interval usage for a
                                single key.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingKey ? (
                                <p className="text-muted-foreground">
                                    Loading...
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <SortableHead
                                                    column="_id"
                                                    label="API Key"
                                                    sort={keySort.sort}
                                                    onToggle={
                                                        keySort.toggleSort
                                                    }
                                                />
                                                <TableHead>
                                                    {t(
                                                        "usageDashboard.weeklyBudget",
                                                    )}
                                                </TableHead>
                                                <SortableHead
                                                    column="requests"
                                                    label="Requests"
                                                    sort={keySort.sort}
                                                    onToggle={
                                                        keySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="input_tokens"
                                                    label="Input"
                                                    sort={keySort.sort}
                                                    onToggle={
                                                        keySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="output_tokens"
                                                    label="Output"
                                                    sort={keySort.sort}
                                                    onToggle={
                                                        keySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cache_creation_input_tokens"
                                                    label="Cache Write"
                                                    sort={keySort.sort}
                                                    onToggle={
                                                        keySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cache_read_input_tokens"
                                                    label="Cache Read"
                                                    sort={keySort.sort}
                                                    onToggle={
                                                        keySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="total_tokens"
                                                    label="Total Tokens"
                                                    sort={keySort.sort}
                                                    onToggle={
                                                        keySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cost"
                                                    label="Est. Cost"
                                                    sort={keySort.sort}
                                                    onToggle={
                                                        keySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="run_rate"
                                                    label="30d Run Rate"
                                                    sort={keySort.sort}
                                                    onToggle={
                                                        keySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <TableHead className="text-right">
                                                    Hourly
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedByKey.map((row) => {
                                                const apiKeyId =
                                                    row?._id == null
                                                        ? null
                                                        : String(row._id);
                                                const isSelected =
                                                    apiKeyId === selectedKeyId;
                                                const isExpanded =
                                                    apiKeyId != null &&
                                                    expandedKeyIds.includes(
                                                        apiKeyId,
                                                    );
                                                const canDrillIntoKey =
                                                    apiKeyId != null;
                                                const hasModelBreakdown =
                                                    getSortedModelBreakdownRows(
                                                        row,
                                                    ).length > 0;
                                                const costDetails =
                                                    getUsageCostDetails(
                                                        row,
                                                        pricingMap,
                                                    );
                                                const cost = costDetails.cost;
                                                const runRate = computeRunRate(
                                                    cost,
                                                    startDate,
                                                    endDate,
                                                );

                                                return (
                                                    <Fragment
                                                        key={
                                                            row._id || "unknown"
                                                        }
                                                    >
                                                        <TableRow
                                                            className={
                                                                isSelected
                                                                    ? "bg-muted/40"
                                                                    : ""
                                                            }
                                                        >
                                                            <TableCell className="font-medium">
                                                                <div className="flex items-center gap-2">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-7 px-2 font-mono text-xs"
                                                                        aria-label={
                                                                            hasModelBreakdown
                                                                                ? isExpanded
                                                                                    ? "Hide model breakout"
                                                                                    : "Show model breakout"
                                                                                : "No model breakout available"
                                                                        }
                                                                        disabled={
                                                                            !hasModelBreakdown
                                                                        }
                                                                        onClick={() =>
                                                                            handleToggleKeyExpansion(
                                                                                apiKeyId,
                                                                            )
                                                                        }
                                                                    >
                                                                        {hasModelBreakdown
                                                                            ? isExpanded
                                                                                ? "Hide"
                                                                                : "Show"
                                                                            : "N/A"}
                                                                    </Button>
                                                                    <div className="min-w-0">
                                                                        {renderApiKeyCell(
                                                                            row._id,
                                                                            keyMappings,
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <WeeklyBudgetControl
                                                                    apiKeyId={
                                                                        row._id
                                                                    }
                                                                    budget={
                                                                        limits
                                                                            ?.budgets?.[
                                                                            row
                                                                                ._id
                                                                        ]
                                                                    }
                                                                    defaultWeeklyUsd={
                                                                        limits?.defaultWeeklyUsd ??
                                                                        null
                                                                    }
                                                                    ready={
                                                                        Boolean(
                                                                            limits,
                                                                        ) &&
                                                                        !limitsError
                                                                    }
                                                                    onSaved={
                                                                        handleBudgetSaved
                                                                    }
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.requests,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.input_tokens,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.output_tokens,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.cache_creation_input_tokens,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.cache_read_input_tokens,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right font-medium">
                                                                {formatNumber(
                                                                    computeTotalTokens(
                                                                        row,
                                                                    ),
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <UsageCost
                                                                    details={
                                                                        costDetails
                                                                    }
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-right text-muted-foreground">
                                                                <UsageCost
                                                                    details={
                                                                        costDetails
                                                                    }
                                                                    value={
                                                                        runRate
                                                                    }
                                                                    per30Days
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Button
                                                                    variant={
                                                                        isSelected
                                                                            ? "secondary"
                                                                            : "outline"
                                                                    }
                                                                    size="sm"
                                                                    disabled={
                                                                        !canDrillIntoKey
                                                                    }
                                                                    onClick={() =>
                                                                        handleSelectKey(
                                                                            apiKeyId,
                                                                        )
                                                                    }
                                                                >
                                                                    {isSelected
                                                                        ? "Jump"
                                                                        : "View"}
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                        {isExpanded && (
                                                            <TableRow>
                                                                <TableCell
                                                                    colSpan={11}
                                                                    className="bg-muted/10"
                                                                >
                                                                    <ApiKeyModelBreakdown
                                                                        row={
                                                                            row
                                                                        }
                                                                        pricingMap={
                                                                            pricingMap
                                                                        }
                                                                    />
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                            {sortedByKey.length === 0 && (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={11}
                                                        className="text-center text-muted-foreground"
                                                    >
                                                        No usage data for this
                                                        period
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card ref={hourlyDrilldownRef} className="mt-6">
                        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <CardTitle>Usage Drill-Down</CardTitle>
                                <CardDescription>
                                    {selectedKeyId ? (
                                        <>
                                            {selectedKeyLabel} by{" "}
                                            {
                                                selectedGranularityOption.descriptionLabel
                                            }
                                            . Intervals are shown in UTC.
                                            {selectedKeySummary && (
                                                <>
                                                    {" "}
                                                    {formatNumber(
                                                        selectedKeySummary.requests,
                                                    )}{" "}
                                                    requests,{" "}
                                                    {formatNumber(
                                                        computeTotalTokens(
                                                            selectedKeySummary,
                                                        ),
                                                    )}{" "}
                                                    tokens,{" "}
                                                    <UsageCost
                                                        details={getUsageCostDetails(
                                                            selectedKeySummary,
                                                            pricingMap,
                                                        )}
                                                    />
                                                    .
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        "Choose an API key above to see interval usage."
                                    )}
                                </CardDescription>
                            </div>
                            {selectedKeyId && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select
                                        value={selectedGranularity}
                                        onValueChange={setSelectedGranularity}
                                    >
                                        <SelectTrigger className="w-[110px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DRILLDOWN_GRANULARITY_OPTIONS.map(
                                                (option) => (
                                                    <SelectItem
                                                        key={option.value}
                                                        value={option.value}
                                                    >
                                                        {option.label}
                                                    </SelectItem>
                                                ),
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <ToggleGroup
                                        type="single"
                                        value={selectedDrilldownView}
                                        onValueChange={(value) =>
                                            value &&
                                            setSelectedDrilldownView(value)
                                        }
                                        className="justify-start"
                                    >
                                        {DRILLDOWN_VIEW_OPTIONS.map(
                                            (option) => (
                                                <ToggleGroupItem
                                                    key={option.value}
                                                    value={option.value}
                                                    size="sm"
                                                    variant="outline"
                                                >
                                                    {option.label}
                                                </ToggleGroupItem>
                                            ),
                                        )}
                                    </ToggleGroup>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={
                                            loadingSelectedKeyInterval ||
                                            sortedBySelectedKeyInterval.length ===
                                                0
                                        }
                                        onClick={handleExportHourlyCsv}
                                    >
                                        Export CSV
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setSelectedKeyId(null)}
                                    >
                                        Clear
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                            {!selectedKeyId ? (
                                <p className="text-muted-foreground">
                                    Select a key from the table above to drill
                                    into interval usage.
                                </p>
                            ) : intervalError ? (
                                <p className="text-red-700 dark:text-red-300">
                                    {t("usageDashboard.loadError")}
                                </p>
                            ) : loadingSelectedKeyInterval ? (
                                <p className="text-muted-foreground">
                                    Loading usage data...
                                </p>
                            ) : selectedDrilldownView === "chart" ? (
                                <UsageTrendChart
                                    rows={chronologicalSelectedKeyInterval}
                                    granularity={selectedGranularity}
                                    pricingMap={pricingMap}
                                />
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <SortableHead
                                                    column="_id"
                                                    label={
                                                        selectedGranularityOption.columnLabel
                                                    }
                                                    sort={intervalSort.sort}
                                                    onToggle={
                                                        intervalSort.toggleSort
                                                    }
                                                />
                                                <SortableHead
                                                    column="requests"
                                                    label="Requests"
                                                    sort={intervalSort.sort}
                                                    onToggle={
                                                        intervalSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="input_tokens"
                                                    label="Input"
                                                    sort={intervalSort.sort}
                                                    onToggle={
                                                        intervalSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="output_tokens"
                                                    label="Output"
                                                    sort={intervalSort.sort}
                                                    onToggle={
                                                        intervalSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cache_creation_input_tokens"
                                                    label="Cache Write"
                                                    sort={intervalSort.sort}
                                                    onToggle={
                                                        intervalSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cache_read_input_tokens"
                                                    label="Cache Read"
                                                    sort={intervalSort.sort}
                                                    onToggle={
                                                        intervalSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="total_tokens"
                                                    label="Total Tokens"
                                                    sort={intervalSort.sort}
                                                    onToggle={
                                                        intervalSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cost"
                                                    label="Est. Cost"
                                                    sort={intervalSort.sort}
                                                    onToggle={
                                                        intervalSort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedBySelectedKeyInterval.map(
                                                (row) => {
                                                    const costDetails =
                                                        getUsageCostDetails(
                                                            row,
                                                            pricingMap,
                                                        );
                                                    return (
                                                        <TableRow key={row._id}>
                                                            <TableCell className="font-medium">
                                                                {row._id}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.requests,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.input_tokens,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.output_tokens,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.cache_creation_input_tokens,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {formatNumber(
                                                                    row.cache_read_input_tokens,
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right font-medium">
                                                                {formatNumber(
                                                                    computeTotalTokens(
                                                                        row,
                                                                    ),
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <UsageCost
                                                                    details={
                                                                        costDetails
                                                                    }
                                                                />
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                },
                                            )}
                                            {sortedBySelectedKeyInterval.length ===
                                                0 && (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={8}
                                                        className="text-center text-muted-foreground"
                                                    >
                                                        No{" "}
                                                        {selectedGranularityOption.descriptionLabel.toLowerCase()}{" "}
                                                        data for this key in the
                                                        selected period
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* By Day */}
                <TabsContent value="by-day">
                    <Card>
                        <CardHeader>
                            <CardTitle>Daily Usage</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loadingDay ? (
                                <p className="text-muted-foreground">
                                    Loading...
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <SortableHead
                                                    column="_id"
                                                    label="Date"
                                                    sort={daySort.sort}
                                                    onToggle={
                                                        daySort.toggleSort
                                                    }
                                                />
                                                <SortableHead
                                                    column="requests"
                                                    label="Requests"
                                                    sort={daySort.sort}
                                                    onToggle={
                                                        daySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="input_tokens"
                                                    label="Input"
                                                    sort={daySort.sort}
                                                    onToggle={
                                                        daySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="output_tokens"
                                                    label="Output"
                                                    sort={daySort.sort}
                                                    onToggle={
                                                        daySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cache_creation_input_tokens"
                                                    label="Cache Write"
                                                    sort={daySort.sort}
                                                    onToggle={
                                                        daySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cache_read_input_tokens"
                                                    label="Cache Read"
                                                    sort={daySort.sort}
                                                    onToggle={
                                                        daySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="total_tokens"
                                                    label="Total Tokens"
                                                    sort={daySort.sort}
                                                    onToggle={
                                                        daySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                                <SortableHead
                                                    column="cost"
                                                    label="Est. Cost"
                                                    sort={daySort.sort}
                                                    onToggle={
                                                        daySort.toggleSort
                                                    }
                                                    className="text-right"
                                                />
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedByDay.map((row) => {
                                                const costDetails =
                                                    getUsageCostDetails(
                                                        row,
                                                        pricingMap,
                                                    );
                                                return (
                                                    <TableRow key={row._id}>
                                                        <TableCell className="font-medium">
                                                            {row._id}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.requests,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.input_tokens,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.output_tokens,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.cache_creation_input_tokens,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                row.cache_read_input_tokens,
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(
                                                                computeTotalTokens(
                                                                    row,
                                                                ),
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            <UsageCost
                                                                details={
                                                                    costDetails
                                                                }
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                            {sortedByDay.length === 0 && (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={8}
                                                        className="text-center text-muted-foreground"
                                                    >
                                                        No usage data for this
                                                        period
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
