"use client";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "../../../@/components/ui/progress";
import { Clock, Cpu } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const QUEUE_NAMES = ["task", "digest-build"];

async function fetchQueueStats(queueName, page, pageSize, status, search) {
    const response = await fetch(
        `/api/queues?queue=${queueName}&page=${page}&pageSize=${pageSize}&status=${status}&search=${search}`,
    );
    if (!response.ok) throw new Error("Failed to fetch queue stats");
    return response.json();
}

async function performQueueAction(queueName, action, params = {}) {
    const searchParams = new URLSearchParams({
        queue: queueName,
        action,
        ...params,
    });
    const response = await fetch(`/api/queues?${searchParams}`);
    if (!response.ok) throw new Error("Failed to perform action");
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

    // If data is an array of strings (logs), display them without wrapping
    if (Array.isArray(data)) {
        return (
            <>
                <div
                    className="bg-gray-50 p-2 rounded-md max-w-[300px] border max-h-[100px] overflow-auto cursor-pointer hover:bg-gray-100"
                    onClick={() => setIsOpen(true)}
                >
                    <pre className="text-xs whitespace-pre">
                        {data.join("\n")}
                    </pre>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogContent className="max-w-7xl overflow-auto">
                        <DialogHeader>
                            <DialogTitle>Data Details</DialogTitle>
                        </DialogHeader>
                        <div className="bg-gray-50 p-4 rounded-md">
                            <pre className="whitespace-pre-wrap text-sm overflow-auto max-h-[60vh]">
                                {data.join("\n")}
                            </pre>
                        </div>
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    // For other data types, use the existing JSON.stringify approach
    const stringifiedData = JSON.stringify(data, null, 2);
    return stringifiedData ? (
        <>
            <div
                className="bg-gray-50 p-2 rounded-md max-w-[300px] border max-h-[100px] overflow-auto cursor-pointer hover:bg-gray-100"
                onClick={() => setIsOpen(true)}
            >
                <pre className="whitespace-pre-wrap text-xs">
                    {stringifiedData}
                </pre>
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Data Details</DialogTitle>
                    </DialogHeader>
                    <div className="bg-gray-50 p-4 rounded-md">
                        <pre className="whitespace-pre-wrap text-sm overflow-auto max-h-[60vh]">
                            {stringifiedData}
                        </pre>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    ) : (
        "-"
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

export default function QueuesPage() {
    const [currentPage, setCurrentPage] = useState(1);
    // eslint-disable-next-line no-unused-vars
    const [pageSize, setPageSize] = useState(10);
    const [selectedQueue, setSelectedQueue] = useState(QUEUE_NAMES[0]);
    const [status, setStatus] = useState("all");
    const [search, setSearch] = useState("");

    const { data: queueStats, refetch } = useQuery({
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

    const handleAction = async (action, params = {}) => {
        try {
            await performQueueAction(selectedQueue, action, params);
            toast.success("Action completed successfully");
            refetch();
        } catch (error) {
            toast.error(error.message);
        }
    };

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
                                                <div className="text-sm font-medium">
                                                    Waiting
                                                </div>
                                                <div className="text-2xl font-bold">
                                                    {queueStats.counts.waiting}
                                                </div>
                                            </div>
                                            <div className="p-4 bg-background rounded-lg border">
                                                <div className="text-sm font-medium">
                                                    Active
                                                </div>
                                                <div className="text-2xl font-bold">
                                                    {queueStats.counts.active}
                                                </div>
                                            </div>
                                            <div className="p-4 bg-background rounded-lg border">
                                                <div className="text-sm font-medium">
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
                                                <div className="text-sm font-medium">
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
                                        <Input
                                            placeholder="Search jobs..."
                                            value={search}
                                            onChange={(e) =>
                                                setSearch(e.target.value)
                                            }
                                            className="max-w-sm"
                                        />
                                        <Select
                                            value={status}
                                            onValueChange={setStatus}
                                        >
                                            <SelectTrigger className="w-[180px]">
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

                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Job ID</TableHead>
                                                <TableHead>Name</TableHead>
                                                <TableHead>User</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Progress</TableHead>
                                                <TableHead>Attempts</TableHead>
                                                <TableHead>Timestamp</TableHead>
                                                <TableHead>Input</TableHead>
                                                <TableHead>Output</TableHead>
                                                <TableHead>Logs</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {queueStats?.jobs.map((job) => (
                                                <TableRow key={job.id}>
                                                    <TableCell>
                                                        {job.id}
                                                    </TableCell>
                                                    <TableCell>
                                                        {job.name}
                                                    </TableCell>
                                                    <TableCell>
                                                        {job.username || "-"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge
                                                            status={job.status}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {job.status ===
                                                        "active" ? (
                                                            <Progress
                                                                value={
                                                                    job.progress
                                                                }
                                                            />
                                                        ) : (
                                                            "-"
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {job.attemptsMade || 0}
                                                    </TableCell>
                                                    <TableCell
                                                        className="whitespace-nowrap"
                                                        title={new Date(
                                                            job.timestamp,
                                                        ).toLocaleString()}
                                                    >
                                                        {formatTimestamp(
                                                            job.timestamp,
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <DataCell
                                                            data={job.data}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {job.status ===
                                                            "failed" && (
                                                            <DataCell
                                                                data={
                                                                    job.failedReason
                                                                }
                                                            />
                                                        )}
                                                        {job.status ===
                                                            "completed" && (
                                                            <DataCell
                                                                data={
                                                                    job.returnvalue
                                                                }
                                                            />
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <DataCell
                                                            data={job.logs?.logs || "No logs available"}
                                                        />
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
                                                    <PaginationPrevious
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
                                                    />
                                                </PaginationItem>
                                                {/* Add pagination items based on totalPages */}
                                                <PaginationItem>
                                                    <PaginationNext
                                                        onClick={() =>
                                                            setCurrentPage(
                                                                (p) => p + 1,
                                                            )
                                                        }
                                                        disabled={
                                                            currentPage ===
                                                            queueStats
                                                                ?.pagination
                                                                .totalPages
                                                        }
                                                    />
                                                </PaginationItem>
                                            </PaginationContent>
                                        </Pagination>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Queue Actions */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Queue Actions</CardTitle>
                                    <CardDescription>
                                        Manage queue and jobs
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex gap-4">
                                        <Button
                                            onClick={() =>
                                                handleAction("retry")
                                            }
                                            disabled={
                                                !queueStats?.counts.failed
                                            }
                                        >
                                            Retry Failed Jobs
                                        </Button>
                                        <Button
                                            onClick={() =>
                                                handleAction("clean", {
                                                    type: "completed",
                                                })
                                            }
                                            disabled={
                                                !queueStats?.counts.completed
                                            }
                                        >
                                            Clean Completed Jobs
                                        </Button>
                                        <Button
                                            onClick={() =>
                                                handleAction("clean", {
                                                    type: "failed",
                                                })
                                            }
                                            disabled={
                                                !queueStats?.counts.failed
                                            }
                                        >
                                            Clean Failed Jobs
                                        </Button>
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
