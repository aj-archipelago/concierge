"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Check,
    Copy,
    Globe,
    Lock,
    Trash2,
    Users as UsersIcon,
} from "lucide-react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import UserAvatar from "../../../src/components/UserAvatar";
import UserPicker from "./UserPicker";
import {
    shareQueryKey,
    shareEntityUrl,
    ownedSharesQueryKey,
} from "./shareUtils";
import { useShareSettings } from "./useShareSettings";

const ENTITY_LABELS = {
    chat: "chat",
    workspace: "workspace",
    applet: "applet",
    automation: "automation",
    article: "article",
};

const VIEWER_ONLY_ENTITY_TYPES = new Set(["chat", "workspace"]);

function emptyShare(entityType, entityId) {
    return {
        entityType,
        entityId,
        link: { enabled: false, role: "viewer" },
        recipients: [],
    };
}

export default function ShareDialog({
    open,
    onOpenChange,
    entityType,
    entityId,
}) {
    const queryClient = useQueryClient();

    const { data, isLoading } = useShareSettings(entityType, entityId, {
        enabled: open,
    });

    const [linkEnabled, setLinkEnabled] = useState(false);
    const [linkRole, setLinkRole] = useState("viewer");
    const [recipients, setRecipients] = useState([]);
    const [copied, setCopied] = useState(false);

    const entityLabel = ENTITY_LABELS[entityType] || "item";
    const isViewerOnlyShare = VIEWER_ONLY_ENTITY_TYPES.has(entityType);

    useEffect(() => {
        const initial = data || emptyShare(entityType, entityId);
        setLinkEnabled(Boolean(initial.link?.enabled));
        setLinkRole(
            isViewerOnlyShare ? "viewer" : initial.link?.role || "viewer",
        );
        setRecipients(
            (initial.recipients || []).map((r) => ({
                userId: String(r.userId),
                role: isViewerOnlyShare ? "viewer" : r.role || "viewer",
                user: r.user || null,
            })),
        );
    }, [data, entityType, entityId, isViewerOnlyShare]);

    const shareUrl = useMemo(() => {
        if (typeof window === "undefined" || !entityId) return "";
        const path = shareEntityUrl(entityType, entityId);
        if (!path) return "";
        return `${window.location.origin}${path}`;
    }, [entityType, entityId]);

    const mutation = useMutation({
        mutationFn: async (payload) => {
            const { data } = await axios.put(
                `/api/shares/${entityType}/${entityId}`,
                payload,
            );
            return data;
        },
        onSuccess: (updatedShare) => {
            queryClient.setQueryData(
                shareQueryKey(entityType, entityId),
                updatedShare,
            );
            queryClient.invalidateQueries({
                queryKey: shareQueryKey(entityType, entityId),
            });
            queryClient.invalidateQueries({
                queryKey: ownedSharesQueryKey(),
            });
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
            if (entityType === "chat") {
                queryClient.invalidateQueries({ queryKey: ["chats"] });
                queryClient.invalidateQueries({
                    queryKey: ["chat", String(entityId)],
                });
            }
            if (entityType === "article") {
                queryClient.invalidateQueries({
                    queryKey: ["article", String(entityId)],
                });
            }
            onOpenChange?.(false);
        },
    });

    const handleCopy = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard rejected; leave UI alone.
        }
    };

    const handleAddRecipient = (user) => {
        setRecipients((prev) => {
            if (prev.some((r) => String(r.userId) === String(user._id))) {
                return prev;
            }
            return [
                ...prev,
                {
                    userId: String(user._id),
                    role: "viewer",
                    user: {
                        _id: user._id,
                        name: user.name,
                        username: user.username,
                        profilePicture: user.profilePicture,
                    },
                },
            ];
        });
    };

    const handleRoleChange = (userId, role) => {
        setRecipients((prev) =>
            prev.map((r) =>
                String(r.userId) === String(userId) ? { ...r, role } : r,
            ),
        );
    };

    const handleRemoveRecipient = (userId) => {
        setRecipients((prev) =>
            prev.filter((r) => String(r.userId) !== String(userId)),
        );
    };

    const handleSave = () => {
        const effectiveLinkRole = isViewerOnlyShare ? "viewer" : linkRole;
        mutation.mutate({
            link: { enabled: linkEnabled, role: effectiveLinkRole },
            recipients: recipients.map(({ userId, role }) => ({
                userId,
                role: isViewerOnlyShare ? "viewer" : role,
            })),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Share {entityLabel}</DialogTitle>
                    <DialogDescription>
                        Share with anyone via link, or invite specific people.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-8 text-center text-sm text-gray-500">
                        Loading…
                    </div>
                ) : (
                    <Tabs defaultValue="link" className="w-full">
                        <TabsList>
                            <TabsTrigger value="link">
                                <Globe className="me-1 h-4 w-4" />
                                Link
                            </TabsTrigger>
                            <TabsTrigger value="people">
                                <UsersIcon className="me-1 h-4 w-4" />
                                People{" "}
                                {recipients.length > 0
                                    ? `(${recipients.length})`
                                    : ""}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="link" className="space-y-4">
                            <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                                <Checkbox
                                    checked={linkEnabled}
                                    onCheckedChange={(v) =>
                                        setLinkEnabled(Boolean(v))
                                    }
                                    className="mt-0.5"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1 text-sm font-medium">
                                        {linkEnabled ? (
                                            <Globe className="h-4 w-4 text-emerald-600" />
                                        ) : (
                                            <Lock className="h-4 w-4 text-gray-400" />
                                        )}
                                        Anyone with the link
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {linkEnabled
                                            ? "Anyone who has the URL can open this " +
                                              entityLabel +
                                              "."
                                            : "Only you and people you invite can open this " +
                                              entityLabel +
                                              "."}
                                    </p>
                                </div>
                            </label>

                            {linkEnabled && !isViewerOnlyShare && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        They can
                                    </span>
                                    <Select
                                        value={linkRole}
                                        onValueChange={setLinkRole}
                                    >
                                        <SelectTrigger className="h-9 w-32">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="viewer">
                                                View
                                            </SelectItem>
                                            <SelectItem value="editor">
                                                Edit
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {linkEnabled && isViewerOnlyShare ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Anyone with the link can view this chat.
                                    Recipients can copy it to continue in their
                                    own chat.
                                </p>
                            ) : null}

                            {linkEnabled ? (
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={shareUrl}
                                        readOnly
                                        onFocus={(e) => e.target.select()}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopy}
                                        disabled={!shareUrl}
                                    >
                                        {copied ? (
                                            <Check className="h-4 w-4 text-emerald-600" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            ) : null}
                        </TabsContent>

                        <TabsContent value="people" className="space-y-3">
                            <UserPicker
                                onSelect={handleAddRecipient}
                                excludeIds={recipients.map((r) => r.userId)}
                            />

                            {recipients.length > 0 && shareUrl && (
                                <div className="flex items-center gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700">
                                    <Input
                                        value={shareUrl}
                                        readOnly
                                        onFocus={(e) => e.target.select()}
                                        className="h-8 text-xs"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopy}
                                        disabled={!shareUrl}
                                        className="h-8 flex-shrink-0"
                                    >
                                        {copied ? (
                                            <Check className="h-4 w-4 text-emerald-600" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            )}

                            <div className="max-h-64 space-y-1 overflow-auto">
                                {recipients.length === 0 ? (
                                    <p className="py-4 text-center text-xs text-gray-500">
                                        No one invited yet.
                                    </p>
                                ) : (
                                    recipients.map((r) => (
                                        <div
                                            key={r.userId}
                                            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                        >
                                            <UserAvatar
                                                src={r.user?.profilePicture}
                                                name={r.user?.name}
                                                className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-gray-200 text-xs dark:bg-gray-700"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">
                                                    {r.user?.name ||
                                                        r.user?.username ||
                                                        "Unknown user"}
                                                </div>
                                                {r.user?.username && (
                                                    <div className="truncate text-xs text-gray-500">
                                                        {r.user.username}
                                                    </div>
                                                )}
                                            </div>
                                            {isViewerOnlyShare ? (
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    Viewer
                                                </span>
                                            ) : (
                                                <Select
                                                    value={r.role}
                                                    onValueChange={(v) =>
                                                        handleRoleChange(
                                                            r.userId,
                                                            v,
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger className="h-8 w-24">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="viewer">
                                                            Viewer
                                                        </SelectItem>
                                                        <SelectItem value="editor">
                                                            Editor
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    handleRemoveRecipient(
                                                        r.userId,
                                                    )
                                                }
                                                aria-label="Remove"
                                            >
                                                <Trash2 className="h-4 w-4 text-gray-500" />
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                )}

                <DialogFooter className="mt-2 gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange?.(false)}
                        disabled={mutation.isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isLoading || mutation.isPending}
                    >
                        {mutation.isPending ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
