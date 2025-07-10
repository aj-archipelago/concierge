"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
} from "@/components/ui/pagination";
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
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
    CheckCircle,
    Clock,
    Cpu,
    FileText,
    Filter,
    Hash,
    Loader2,
    Search,
    User,
    XCircle,
    Hash as HashIcon,
    FileCode,
    BarChart3,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Progress } from "../../../@/components/ui/progress";
import stringcase from "stringcase";

const QUEUE_NAMES = ["task", "digest-build"];

async function fetchQueueStats(queueName, page, pageSize, status, search) {
    const response = await fetch(
        `/api/queues?queue=${queueName}&page=${page}&pageSize=${pageSize}&status=${status}&search=${search}`,
    );
    if (!response.ok) throw new Error("Failed to fetch queue stats");
    return response.json();
}

function StatusBadge({ status }) {
    const statusStyles = {
        waiting:
            "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
        active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
        completed:
            "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };

    return (
        <Badge
            variant="secondary"
            className={cn(
                "font-medium",
                statusStyles[status] ||
                    "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
            )}
        >
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
    );
}

function DataCell({ data }) {
    const [isOpen, setIsOpen] = useState(false);

    // Prepare the display content
    let displayContent;
    let dialogContent;

    if (Array.isArray(data)) {
        displayContent = data.join("\n");
        dialogContent = data.join("\n");
    } else {
        const stringifiedData =
            typeof data === "string" ? data : JSON.stringify(data, null, 2);
        if (!stringifiedData) return "-";
        displayContent = stringifiedData;
        dialogContent = stringifiedData;
    }

    return (
        <>
            <div
                className="bg-gray-50 p-2 rounded-md max-w-[300px] border max-h-[150px] overflow-auto cursor-pointer hover:bg-gray-100"
                onClick={() => setIsOpen(true)}
            >
                <pre className="text-xs whitespace-pre-wrap">
                    {displayContent}
                </pre>
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent
                    className={Array.isArray(data) ? "max-w-7xl" : "max-w-3xl"}
                >
                    <DialogHeader>
                        <DialogTitle>Data Details</DialogTitle>
                    </DialogHeader>
                    <div className="bg-gray-50 p-4 rounded-md w-full overflow-auto">
                        <pre className="w-full whitespace-pre-wrap text-sm overflow-auto max-h-[60vh]">
                            {dialogContent}
                        </pre>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    // If less than 24 hours ago, show relative time
    if (diffInHours < 24) {
        if (diffInHours < 1) {
            const minutes = Math.floor((now - date) / (1000 * 60));
            return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
        }
        const hours = Math.floor(diffInHours);
        return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    }

    // Otherwise show formatted date
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatWorkerAge(ageInSeconds) {
    if (ageInSeconds < 60) {
        return `${Math.floor(ageInSeconds)}s`;
    } else if (ageInSeconds < 3600) {
        return `${Math.floor(ageInSeconds / 60)}m`;
    } else if (ageInSeconds < 86400) {
        return `${Math.floor(ageInSeconds / 3600)}h`;
    } else {
        return `${Math.floor(ageInSeconds / 86400)}d`;
    }
}

function WorkerStatus({ worker }) {
    const [showDebug, setShowDebug] = useState(false);

    return (
        <div className="p-4 bg-background rounded-lg border">
            <div className="flex justify-between items-start mb-2">
                <div className="text-sm font-semibold truncate flex-1">
                    {worker.name} ({worker.id})
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Cpu className="h-4 w-4" />
                    <span className="truncate">Address: {worker.addr}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Age: {formatWorkerAge(parseInt(worker.age))}</span>
                </div>
            </div>

            <div className="mt-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDebug(!showDebug)}
                >
                    {showDebug ? "Hide Debug Info" : "Show Debug Info"}
                </Button>

                {showDebug && (
                    <div className="mt-2 bg-gray-50 p-2 rounded-md">
                        <pre className="text-xs whitespace-pre-wrap">
                            {JSON.stringify(worker.debug, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}

function ReturnValueCell({ returnValue }) {
    if (!returnValue) {
        return (
            <div className="text-sm text-muted-foreground italic">
                No output
            </div>
        );
    }

    const { type, charCount, lineCount, hasContent, keys } = returnValue;

    return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-800">
                <CheckCircle className="h-4 w-4" />
                <span className="capitalize">{type} Output</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2">
                    <BarChart3 className="h-3 w-3 text-green-600" />
                    <span className="text-green-700">
                        {charCount.toLocaleString()} chars
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <FileCode className="h-3 w-3 text-green-600" />
                    <span className="text-green-700">
                        {lineCount} line{lineCount !== 1 ? "s" : ""}
                    </span>
                </div>
            </div>

            {type === "object" && keys && keys.length > 0 && (
                <div className="mt-2">
                    <div className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                        <HashIcon className="h-3 w-3" />
                        Properties:
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {keys.slice(0, 5).map((key, index) => (
                            <span
                                key={index}
                                className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-md"
                            >
                                {key}
                            </span>
                        ))}
                        {keys.length > 5 && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-md">
                                +{keys.length - 5} more
                            </span>
                        )}
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2 text-xs">
                <div
                    className={`w-2 h-2 rounded-full ${hasContent ? "bg-green-500" : "bg-gray-300"}`}
                />
                <span
                    className={hasContent ? "text-green-700" : "text-gray-500"}
                >
                    {hasContent ? "Content available" : "Empty output"}
                </span>
            </div>
        </div>
    );
}

export default function QueuesPage() {
    const [currentPage, setCurrentPage] = useState(1);
    // eslint-disable-next-line no-unused-vars
    const [pageSize, setPageSize] = useState(10);
    const [selectedQueue, setSelectedQueue] = useState(QUEUE_NAMES[0]);
    const [status, setStatus] = useState("all");
    const [search, setSearch] = useState("");

    const { data: queueStats } = useQuery({
        queryKey: [
            "queueStats",
            selectedQueue,
            currentPage,
            pageSize,
            status,
            search,
        ],
        queryFn: () =>
            fetchQueueStats(
                selectedQueue,
                currentPage,
                pageSize,
                status,
                search,
            ),
        refetchInterval: 5000,
    });

    useEffect(() => {
        setCurrentPage(1);
    }, [status, search]);

    return (
        <div>
            <h1 className="text-2xl font-bold mb-6">Queue Monitoring</h1>

            <Tabs defaultValue={selectedQueue} onValueChange={setSelectedQueue}>
                <TabsList>
                    {QUEUE_NAMES.map((name) => (
                        <TabsTrigger key={name} value={name}>
                            {name}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {QUEUE_NAMES.map((queueName) => (
                    <TabsContent key={queueName} value={queueName}>
                        <div className="grid gap-4">
                            {/* Queue Overview */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Queue Overview</CardTitle>
                                    <CardDescription>
                                        Current status and statistics
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {queueStats && (
                                        <div className="grid grid-cols-4 gap-4">
                                            <div className="p-4 bg-background rounded-lg border">
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <Clock className="h-4 w-4" />
                                                    Waiting
                                                </div>
                                                <div className="text-2xl font-bold">
                                                    {queueStats.counts.waiting}
                                                </div>
                                            </div>
                                            <div className="p-4 bg-background rounded-lg border">
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <Loader2 className="h-4 w-4" />
                                                    Active
                                                </div>
                                                <div className="text-2xl font-bold">
                                                    {queueStats.counts.active}
                                                </div>
                                            </div>
                                            <div className="p-4 bg-background rounded-lg border">
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <CheckCircle className="h-4 w-4" />
                                                    Completed
                                                </div>
                                                <div className="text-2xl font-bold">
                                                    {
                                                        queueStats.counts
                                                            .completed
                                                    }
                                                </div>
                                            </div>
                                            <div className="p-4 bg-background rounded-lg border">
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <XCircle className="h-4 w-4" />
                                                    Failed
                                                </div>
                                                <div className="text-2xl font-bold">
                                                    {queueStats.counts.failed}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Add Worker Status Card */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Workers</CardTitle>
                                    <CardDescription>
                                        Active queue workers and their status
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {queueStats?.workers?.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {queueStats.workers.map(
                                                (worker) => (
                                                    <WorkerStatus
                                                        key={worker.id}
                                                        worker={worker}
                                                    />
                                                ),
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-center text-muted-foreground py-4">
                                            No active workers found
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Unified Jobs List */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Jobs</CardTitle>
                                    <CardDescription>
                                        All queue jobs
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex gap-4 mb-4">
                                        <div className="relative max-w-sm">
                                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search jobs..."
                                                value={search}
                                                onChange={(e) =>
                                                    setSearch(e.target.value)
                                                }
                                                className="pl-10"
                                            />
                                        </div>
                                        <div className="relative">
                                            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                            <Select
                                                value={status}
                                                onValueChange={setStatus}
                                            >
                                                <SelectTrigger className="w-[180px] pl-10">
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">
                                                        All
                                                    </SelectItem>
                                                    <SelectItem value="waiting">
                                                        Waiting
                                                    </SelectItem>
                                                    <SelectItem value="active">
                                                        Active
                                                    </SelectItem>
                                                    <SelectItem value="completed">
                                                        Completed
                                                    </SelectItem>
                                                    <SelectItem value="failed">
                                                        Failed
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Job Info</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Input</TableHead>
                                                <TableHead>
                                                    Data & Results
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {queueStats?.jobs.map((job) => (
                                                <TableRow key={job.id}>
                                                    <TableCell className="align-top">
                                                        <div className="space-y-1">
                                                            <div className="text-sm flex gap-1 font-semibold items-center">
                                                                <FileText className="h-4 w-4 mr-1" />
                                                                {stringcase.sentencecase(
                                                                    job.name,
                                                                )}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                <User className="h-4 w-4 inline me-1" />
                                                                {job.username ||
                                                                    "-"}
                                                            </div>
                                                            <div className="text-gray-500 flex items-center gap-2">
                                                                <Hash className="h-4 w-4" />
                                                                {job.id}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="align-top">
                                                        <div className="space-y-2">
                                                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                                                                <Clock className="h-4 w-4" />
                                                                {formatTimestamp(
                                                                    job.timestamp,
                                                                )}
                                                            </div>
                                                            <StatusBadge
                                                                status={
                                                                    job.status
                                                                }
                                                            />
                                                            {job.status ===
                                                                "active" && (
                                                                <div className="w-full">
                                                                    <Progress
                                                                        value={
                                                                            job.progress
                                                                        }
                                                                    />
                                                                </div>
                                                            )}
                                                            <div className="text-xs text-gray-500 flex items-center gap-1">
                                                                Attempts:{" "}
                                                                {job.attemptsMade ||
                                                                    0}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="align-top">
                                                        <DataCell
                                                            data={job.data}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="align-top">
                                                        <div className="space-y-2">
                                                            {job.status ===
                                                                "failed" && (
                                                                <div>
                                                                    <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                                                        <XCircle className="h-3 w-3" />
                                                                        Error:
                                                                    </div>
                                                                    <DataCell
                                                                        data={
                                                                            job.failedReason
                                                                        }
                                                                    />
                                                                </div>
                                                            )}
                                                            {job.status ===
                                                                "completed" && (
                                                                <div>
                                                                    <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                                                        <CheckCircle className="h-3 w-3" />
                                                                        Output:
                                                                    </div>
                                                                    <ReturnValueCell
                                                                        returnValue={
                                                                            job.returnvalue
                                                                        }
                                                                    />
                                                                </div>
                                                            )}
                                                            <div>
                                                                <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                                                    <FileText className="h-3 w-3" />
                                                                    Logs:
                                                                </div>
                                                                <DataCell
                                                                    data={
                                                                        job.logs
                                                                            ?.logs
                                                                            ?.length >
                                                                        0
                                                                            ? job
                                                                                  .logs
                                                                                  ?.logs
                                                                            : "No logs available"
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>

                                    {/* Pagination */}
                                    <div className="mt-4">
                                        <Pagination>
                                            <PaginationContent>
                                                <PaginationItem>
                                                    <button
                                                        onClick={() =>
                                                            setCurrentPage(
                                                                (p) =>
                                                                    Math.max(
                                                                        1,
                                                                        p - 1,
                                                                    ),
                                                            )
                                                        }
                                                        disabled={
                                                            currentPage === 1
                                                        }
                                                        className={`px-3 py-2 text-sm rounded-md transition-colors ${
                                                            currentPage === 1
                                                                ? "text-muted-foreground cursor-not-allowed opacity-50"
                                                                : "hover:bg-muted"
                                                        }`}
                                                    >
                                                        Previous
                                                    </button>
                                                </PaginationItem>

                                                {/* Page numbers */}
                                                {queueStats?.pagination &&
                                                    (() => {
                                                        const { totalPages } =
                                                            queueStats.pagination;
                                                        const pages = [];

                                                        // Show up to 5 pages around current page
                                                        const start = Math.max(
                                                            1,
                                                            currentPage - 2,
                                                        );
                                                        const end = Math.min(
                                                            totalPages,
                                                            currentPage + 2,
                                                        );

                                                        // Add first page if not in range
                                                        if (start > 1) {
                                                            pages.push(1);
                                                            if (start > 2)
                                                                pages.push(
                                                                    "...",
                                                                );
                                                        }

                                                        // Add pages in range
                                                        for (
                                                            let i = start;
                                                            i <= end;
                                                            i++
                                                        ) {
                                                            pages.push(i);
                                                        }

                                                        // Add last page if not in range
                                                        if (end < totalPages) {
                                                            if (
                                                                end <
                                                                totalPages - 1
                                                            )
                                                                pages.push(
                                                                    "...",
                                                                );
                                                            pages.push(
                                                                totalPages,
                                                            );
                                                        }

                                                        return pages.map(
                                                            (page, index) => (
                                                                <PaginationItem
                                                                    key={index}
                                                                >
                                                                    {page ===
                                                                    "..." ? (
                                                                        <span className="px-3 py-2 text-sm text-muted-foreground">
                                                                            {
                                                                                page
                                                                            }
                                                                        </span>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() =>
                                                                                setCurrentPage(
                                                                                    page,
                                                                                )
                                                                            }
                                                                            className={`px-3 py-2 text-sm ${
                                                                                currentPage ===
                                                                                page
                                                                                    ? "bg-neutral-100 font-bold"
                                                                                    : "hover:bg-muted"
                                                                            } rounded-md`}
                                                                        >
                                                                            {
                                                                                page
                                                                            }
                                                                        </button>
                                                                    )}
                                                                </PaginationItem>
                                                            ),
                                                        );
                                                    })()}

                                                <PaginationItem>
                                                    <button
                                                        onClick={() =>
                                                            setCurrentPage(
                                                                (p) => p + 1,
                                                            )
                                                        }
                                                        disabled={
                                                            !queueStats?.pagination ||
                                                            currentPage >=
                                                                queueStats
                                                                    .pagination
                                                                    .totalPages
                                                        }
                                                        className={`px-3 py-2 text-sm rounded-md transition-colors ${
                                                            !queueStats?.pagination ||
                                                            currentPage >=
                                                                queueStats
                                                                    .pagination
                                                                    .totalPages
                                                                ? "text-muted-foreground cursor-not-allowed opacity-50"
                                                                : "hover:bg-muted"
                                                        }`}
                                                    >
                                                        Next
                                                    </button>
                                                </PaginationItem>
                                            </PaginationContent>
                                        </Pagination>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
