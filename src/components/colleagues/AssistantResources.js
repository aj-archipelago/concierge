"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UserPicker from "@/components/share/UserPicker";

const selectClass =
    "min-h-10 max-w-full rounded-md border border-gray-300 bg-white px-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";
export default function AssistantResources({ assistant }) {
    const { t } = useTranslation();
    const client = useQueryClient();
    const [files, setFiles] = useState([]);
    const [sharing, setSharing] = useState(null);
    const [folder, setFolder] = useState("");
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const base = `/api/colleagues/${assistant.id}`;
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        setFiles([]);
        setSharing(null);
        Promise.all([
            axios.get(`${base}/materials`),
            assistant.isOwner
                ? axios.get(`${base}/sharing`)
                : Promise.resolve(null),
        ])
            .then(([materials, share]) => {
                if (active) {
                    setFiles(materials.data.files);
                    setSharing(share?.data || null);
                }
            })
            .catch((e) => {
                if (active)
                    setError(e.response?.data?.error || t("colleagues.error"));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [base, assistant.isOwner, t]);
    async function perform(operation) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await operation();
            client.invalidateQueries({ queryKey: ["colleagues"] });
            setNotice(t("assistantDirectory.saved"));
        } catch (e) {
            setError(
                e.response?.data?.error || e.message || t("colleagues.error"),
            );
        } finally {
            setBusy(false);
        }
    }
    async function upload(chosen) {
        await perform(async () => {
            const skillFolder = chosen.some((file) =>
                file.webkitRelativePath?.endsWith("/SKILL.md"),
            );
            try {
                for (const file of chosen) {
                    const relative = file.webkitRelativePath || file.name;
                    let path = [folder.trim().replace(/\/+$/, ""), relative]
                        .filter(Boolean)
                        .join("/");
                    if (relative === "SKILL.md" && !folder.trim())
                        path = "skills/custom/SKILL.md";
                    else if (
                        skillFolder &&
                        !folder.trim() &&
                        !relative.startsWith("skills/")
                    )
                        path = `skills/${relative}`;
                    const body = new FormData();
                    body.append("file", file);
                    await axios.post(
                        `${base}/materials?path=${encodeURIComponent(path)}`,
                        body,
                    );
                }
            } finally {
                setFiles((await axios.get(`${base}/materials`)).data.files);
                client.invalidateQueries({ queryKey: ["colleagues"] });
            }
        });
    }
    return (
        <div className="space-y-7">
            {error && (
                <p
                    role="alert"
                    className="text-sm text-red-700 dark:text-red-300"
                >
                    {error}
                </p>
            )}
            {notice && (
                <p
                    role="status"
                    className="text-sm text-emerald-700 dark:text-emerald-300"
                >
                    {notice}
                </p>
            )}
            <section className="space-y-3">
                <h3 className="font-semibold">
                    {t("assistantDirectory.materials")}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("assistantDirectory.materialsHelp")}
                </p>
                {loading ? (
                    <p role="status">{t("Loading...")}</p>
                ) : (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {files.map((file) => (
                            <li
                                key={file.path}
                                className="flex min-w-0 items-center gap-3 py-2 text-sm"
                            >
                                <span
                                    className="min-w-0 flex-1 break-all"
                                    dir="auto"
                                >
                                    {file.path}
                                </span>
                                {assistant.editable && (
                                    <Button
                                        variant="ghost"
                                        disabled={busy}
                                        aria-label={`${t("Delete")} ${file.path}`}
                                        onClick={() => {
                                            if (
                                                window.confirm(
                                                    t(
                                                        "assistantDirectory.deleteMaterial",
                                                    ),
                                                )
                                            )
                                                perform(async () => {
                                                    await axios.delete(
                                                        `${base}/materials?path=${encodeURIComponent(file.path)}`,
                                                    );
                                                    setFiles((previous) =>
                                                        previous.filter(
                                                            (f) =>
                                                                f.path !==
                                                                file.path,
                                                        ),
                                                    );
                                                });
                                        }}
                                    >
                                        {t("Delete")}
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {!loading && !files.length && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t("assistantDirectory.noMaterials")}
                    </p>
                )}
                {assistant.editable && (
                    <div className="space-y-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                        <label className="block space-y-1 text-sm">
                            <span>{t("assistantDirectory.folder")}</span>
                            <Input
                                value={folder}
                                onChange={(e) => setFolder(e.target.value)}
                                placeholder="skills/research"
                                disabled={busy}
                            />
                        </label>
                        <div className="flex flex-wrap gap-3">
                            <label className="min-h-10 cursor-pointer focus-within:ring-2 focus-within:ring-sky-500 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">
                                <span>{t("assistantDirectory.upload")}</span>
                                <input
                                    className="sr-only"
                                    type="file"
                                    multiple
                                    disabled={busy}
                                    onChange={(e) => {
                                        const chosen = Array.from(
                                            e.target.files || [],
                                        );
                                        e.target.value = "";
                                        upload(chosen);
                                    }}
                                />
                            </label>
                            <label className="min-h-10 cursor-pointer focus-within:ring-2 focus-within:ring-sky-500 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600">
                                <span>
                                    {t("assistantDirectory.uploadFolder")}
                                </span>
                                <input
                                    className="sr-only"
                                    type="file"
                                    multiple
                                    webkitdirectory=""
                                    disabled={busy}
                                    onChange={(e) => {
                                        const chosen = Array.from(
                                            e.target.files || [],
                                        );
                                        e.target.value = "";
                                        upload(chosen);
                                    }}
                                />
                            </label>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t("assistantDirectory.skillHelp")}
                        </p>
                    </div>
                )}
            </section>
            {sharing && (
                <section className="space-y-3 border-t border-gray-200 pt-5 dark:border-gray-700">
                    <h3 className="font-semibold">
                        {t("assistantDirectory.sharing")}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t("assistantDirectory.sharingHelp")}
                    </p>
                    <select
                        aria-label={t("assistantDirectory.visibility")}
                        className={selectClass}
                        disabled={busy}
                        value={sharing.visibility}
                        onChange={(e) =>
                            setSharing({
                                ...sharing,
                                visibility: e.target.value,
                            })
                        }
                    >
                        {["private", "public"].map((v) => (
                            <option key={v} value={v}>
                                {t(`assistantDirectory.${v}`)}
                            </option>
                        ))}
                    </select>
                    <fieldset disabled={busy}>
                        <UserPicker
                            excludeIds={sharing.recipients.map((e) => e.userId)}
                            onSelect={(user) =>
                                setSharing((previous) => ({
                                    ...previous,
                                    recipients: [
                                        ...previous.recipients,
                                        {
                                            userId: String(user._id),
                                            name: user.name,
                                            username: user.username,
                                            role: "viewer",
                                        },
                                    ],
                                }))
                            }
                        />
                    </fieldset>
                    {sharing.recipients.map((person) => (
                        <div
                            key={person.userId}
                            className="flex flex-wrap items-center gap-2 text-sm"
                        >
                            <span className="min-w-0 flex-1 break-words">
                                {person.name || person.username}
                            </span>
                            <select
                                aria-label={`${t("assistantDirectory.role")} ${person.name}`}
                                className={selectClass}
                                disabled={busy}
                                value={person.role}
                                onChange={(e) =>
                                    setSharing({
                                        ...sharing,
                                        recipients: sharing.recipients.map(
                                            (p) =>
                                                p.userId === person.userId
                                                    ? {
                                                          ...p,
                                                          role: e.target.value,
                                                      }
                                                    : p,
                                        ),
                                    })
                                }
                            >
                                {["viewer", "editor"].map((role) => (
                                    <option key={role} value={role}>
                                        {t(`assistantDirectory.${role}`)}
                                    </option>
                                ))}
                            </select>
                            <Button
                                variant="ghost"
                                disabled={busy}
                                aria-label={`${t("Remove")} ${person.name}`}
                                onClick={() =>
                                    setSharing({
                                        ...sharing,
                                        recipients: sharing.recipients.filter(
                                            (p) => p.userId !== person.userId,
                                        ),
                                    })
                                }
                            >
                                {t("Remove")}
                            </Button>
                        </div>
                    ))}
                    <Button
                        disabled={busy}
                        onClick={() =>
                            perform(() => axios.put(`${base}/sharing`, sharing))
                        }
                    >
                        {t("assistantDirectory.saveSharing")}
                    </Button>
                </section>
            )}
        </div>
    );
}
