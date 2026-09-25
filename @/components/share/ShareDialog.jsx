"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { LanguageContext } from "../../../src/contexts/LanguageProvider";

const ENTITY_LABELS = {
    chat: "shareDialog.entity.chat",
    workspace: "shareDialog.entity.workspace",
    applet: "shareDialog.entity.applet",
    published_applet: "shareDialog.entity.publishedApplet",
    automation: "shareDialog.entity.automation",
    article: "shareDialog.entity.article",
};

const VIEWER_ONLY_ENTITY_TYPES = new Set([
    "chat",
    "workspace",
    "published_applet",
]);

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
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext) || {};

    const { data, isLoading } = useShareSettings(entityType, entityId, {
        enabled: open,
    });

    const [linkEnabled, setLinkEnabled] = useState(false);
    const [linkRole, setLinkRole] = useState("viewer");
    const [recipients, setRecipients] = useState([]);
    const [copied, setCopied] = useState(false);

    const entityLabel = t(
        ENTITY_LABELS[entityType] || "shareDialog.entity.item",
    );
    const isViewerOnlyShare = VIEWER_ONLY_ENTITY_TYPES.has(entityType);
    const viewerOnlyMessage =
        entityType === "chat"
            ? t("shareDialog.viewerOnly.chat")
            : entityType === "workspace"
              ? t("shareDialog.viewerOnly.workspace")
              : t("shareDialog.viewerOnly.publishedApplet");

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
            <DialogContent
                dir={direction}
                className="max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full"
            >
                <DialogHeader>
                    <DialogTitle>
                        {t("shareDialog.title", { entity: entityLabel })}
                    </DialogTitle>
                    <DialogDescription>
                        {t("shareDialog.description")}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        {t("shareDialog.loading")}
                    </div>
                ) : (
                    <Tabs defaultValue="link" className="w-full">
                        <TabsList>
                            <TabsTrigger value="link">
                                <Globe className="me-1 h-4 w-4" />
                                {t("shareDialog.tab.link")}
                            </TabsTrigger>
                            <TabsTrigger value="people">
                                <UsersIcon className="me-1 h-4 w-4" />
                                {t("shareDialog.tab.people")}{" "}
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
                                        {t("shareDialog.anyoneWithLink")}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {linkEnabled
                                            ? t(
                                                  "shareDialog.linkEnabledDescription",
                                                  { entity: entityLabel },
                                              )
                                            : t(
                                                  "shareDialog.linkDisabledDescription",
                                                  { entity: entityLabel },
                                              )}
                                    </p>
                                </div>
                            </label>

                            {linkEnabled && !isViewerOnlyShare && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        {t("shareDialog.theyCan")}
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
                                                {t("shareDialog.role.view")}
                                            </SelectItem>
                                            <SelectItem value="editor">
                                                {t("shareDialog.role.edit")}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {linkEnabled && isViewerOnlyShare ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {viewerOnlyMessage}
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
                                placeholder={t(
                                    "shareDialog.searchPeoplePlaceholder",
                                )}
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
                                    <p className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                                        {t("shareDialog.noRecipients")}
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
                                                        t(
                                                            "shareDialog.unknownUser",
                                                        )}
                                                </div>
                                                {r.user?.username && (
                                                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                                                        {r.user.username}
                                                    </div>
                                                )}
                                            </div>
                                            {isViewerOnlyShare ? (
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {t(
                                                        "shareDialog.role.viewer",
                                                    )}
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
                                                            {t(
                                                                "shareDialog.role.viewer",
                                                            )}
                                                        </SelectItem>
                                                        <SelectItem value="editor">
                                                            {t(
                                                                "shareDialog.role.editor",
                                                            )}
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
                                                aria-label={t(
                                                    "shareDialog.remove",
                                                )}
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
                        {t("Cancel")}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isLoading || mutation.isPending}
                    >
                        {mutation.isPending
                            ? t("shareDialog.saving")
                            : t("Save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
