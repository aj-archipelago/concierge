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
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
    const [isExpanded, setIsExpanded] = useState(false);
    const stringifiedData = JSON.stringify(data, null, 2);
    const isLong = stringifiedData?.length > 100;

    return stringifiedData ? (
        <div className=" bg-gray-50 p-2 rounded-md max-w-[300px] border">
            <pre
                className={cn(
                    "whitespace-pre-wrap text-xs",
                    !isExpanded && isLong && "max-h-[100px] overflow-hidden",
                )}
            >
                {stringifiedData}
            </pre>

            {isLong && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-xs text-blue-500 hover:text-blue-600 mt-1 font-medium"
                >
                    {isExpanded ? "Show less" : "Show more"}
                </button>
            )}
        </div>
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

export default function QueuesPage() {
    const [currentPage, setCurrentPage] = useState(1);
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
                                                <TableHead>Timestamp</TableHead>
                                                <TableHead>Details</TableHead>
                                                <TableHead>Data</TableHead>
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
                                                            data={job.data}
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
