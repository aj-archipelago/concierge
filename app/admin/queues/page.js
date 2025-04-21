"use client";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

const QUEUE_NAMES = ["task", "digest-build"];

async function fetchQueueStats(queueName) {
    const response = await fetch(`/api/queues?queue=${queueName}`);
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

export default function QueuesPage() {
    const [selectedQueue, setSelectedQueue] = useState(QUEUE_NAMES[0]);
    const { data: queueStats, refetch } = useQuery({
        queryKey: ["queueStats", selectedQueue],
        queryFn: () => fetchQueueStats(selectedQueue),
        refetchInterval: 5000, // Refresh every 5 seconds
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

                            {/* Active Jobs */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Active Jobs</CardTitle>
                                    <CardDescription>
                                        Currently processing jobs
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Job ID</TableHead>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Progress</TableHead>
                                                <TableHead>Started</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {queueStats?.active.map((job) => (
                                                <TableRow key={job.id}>
                                                    <TableCell>
                                                        {job.id}
                                                    </TableCell>
                                                    <TableCell>
                                                        {job.name}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Progress
                                                            value={job.progress}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {new Date(
                                                            job.timestamp,
                                                        ).toLocaleString()}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                            {/* Failed Jobs */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Failed Jobs</CardTitle>
                                    <CardDescription>
                                        Jobs that have failed
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Job ID</TableHead>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Error</TableHead>
                                                <TableHead>Failed At</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {queueStats?.failed.map((job) => (
                                                <TableRow key={job.id}>
                                                    <TableCell>
                                                        {job.id}
                                                    </TableCell>
                                                    <TableCell>
                                                        {job.name}
                                                    </TableCell>
                                                    <TableCell>
                                                        {job.failedReason}
                                                    </TableCell>
                                                    <TableCell>
                                                        {new Date(
                                                            job.timestamp,
                                                        ).toLocaleString()}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
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
