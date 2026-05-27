"use client";

import React, { useContext, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    BookOpen,
    Plus,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight,
    Save,
    FileText,
    File as FileIcon,
    Loader2,
    X,
    Upload,
} from "lucide-react";
import classNames from "../../../app/utils/class-names";
import { useSkills } from "../../hooks/useSkills";
import MarkdownEditor from "../../../app/workspaces/components/MarkdownEditor";
import { LanguageContext } from "../../contexts/LanguageProvider";
import {
    SKILL_DESCRIPTION_MAX_LENGTH,
    splitSkillSummaryDescription,
} from "../../utils/skillDescriptionLimits";

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SkillCreateEditor({ onSave, onComplete, onCancel, uploadSkillFile }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const BackIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [content, setContent] = useState("");
    const [stagedFiles, setStagedFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState("");
    const [error, setError] = useState(null);
    const fileInputRef = React.useRef(null);

    const handleAddFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.name.toLowerCase() === "skill.md") {
            setError(
                t(
                    "SKILL.md is managed automatically — use the content field instead",
                ),
            );
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        if (stagedFiles.some((f) => f.name === file.name)) {
            setError(
                t('File "{{name}}" is already added', { name: file.name }),
            );
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        setStagedFiles((prev) => [...prev, file]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleRemoveFile = (fileName) => {
        setStagedFiles((prev) => prev.filter((f) => f.name !== fileName));
    };

    const handleSave = async () => {
        setError(null);
        if (!name.trim() || !description.trim() || !content.trim()) {
            setError(t("All fields are required"));
            return;
        }
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
            setError(
                t("Name must be lowercase letters, numbers, and hyphens only"),
            );
            return;
        }
        setSaving(true);
        try {
            setSaveStatus(t("Creating skill..."));
            await onSave({ name: name.toLowerCase(), description, content });

            for (let i = 0; i < stagedFiles.length; i++) {
                setSaveStatus(
                    t("Uploading file {{current}} of {{total}}...", {
                        current: i + 1,
                        total: stagedFiles.length,
                    }),
                );
                await uploadSkillFile(name.toLowerCase(), stagedFiles[i]);
            }
            onComplete();
        } catch (err) {
            setError(err.message);
            setSaving(false);
            setSaveStatus("");
        }
    };

    return (
        <div className="space-y-4" dir={direction}>
            <button
                onClick={onCancel}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
                <BackIcon className="h-4 w-4" />
                {t("Back to skills")}
            </button>

            {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("Name")}
                </label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase())}
                    placeholder="my-skill"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("Description")}
                </label>
                <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("When to use this skill...")}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t(
                        "The AI uses this description to decide when to load the skill.",
                    )}{" "}
                    {t("skill_description_limit_guidance", {
                        max: SKILL_DESCRIPTION_MAX_LENGTH,
                    })}
                </p>
                <p
                    className={classNames(
                        "mt-0.5 text-xs tabular-nums",
                        splitSkillSummaryDescription(description).overflow
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-gray-400 dark:text-gray-500",
                    )}
                    dir="ltr"
                >
                    {t("skill_summary_character_count", {
                        current: description.length,
                        max: SKILL_DESCRIPTION_MAX_LENGTH,
                    })}
                </p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("SKILL.md Content")}
                </label>
                <MarkdownEditor
                    value={content}
                    onChange={setContent}
                    placeholder={t(
                        "# My Skill - Instructions and best practices...",
                    )}
                />
            </div>

            {/* Supporting files */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t("Supporting Files")}
                </label>
                {stagedFiles.length > 0 && (
                    <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden mb-2">
                        {stagedFiles.map((file) => (
                            <div
                                key={file.name}
                                className={classNames(
                                    "flex items-center justify-between px-3 py-2",
                                    "border-b border-gray-200 dark:border-gray-700 last:border-b-0",
                                    "bg-white dark:bg-gray-800",
                                )}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <FileIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                    <span className="text-sm truncate text-gray-700 dark:text-gray-300">
                                        {file.name}
                                    </span>
                                    <span className="flex-shrink-0 text-xs text-gray-400">
                                        {formatFileSize(file.size)}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleRemoveFile(file.name)}
                                    className="ms-2 flex-shrink-0 text-gray-400 hover:text-red-500"
                                    aria-label={t("Remove {{name}}", {
                                        name: file.name,
                                    })}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleAddFile}
                    className="hidden"
                />
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                >
                    <Upload className="me-1 h-3 w-3" />
                    {t("Add file")}
                </Button>
            </div>

            <div className="flex items-center justify-end gap-2">
                {saving && saveStatus && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {saveStatus}
                    </span>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onCancel}
                    disabled={saving}
                >
                    {t("Cancel")}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="me-1 h-4 w-4" />
                    {saving ? t("Creating...") : t("Create Skill")}
                </Button>
            </div>
        </div>
    );
}

function SkillFileBrowser({
    skill,
    onCancel,
    onDescriptionSave,
    fetchSkillFiles,
    uploadSkillFile,
    deleteSkillFile,
    getSkillContent,
    updateSkill,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const BackIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
    const [description, setDescription] = useState(skill?.description || "");
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [editingContent, setEditingContent] = useState(false);
    const [contentDraft, setContentDraft] = useState("");
    const [savingContent, setSavingContent] = useState(false);
    const [savingDesc, setSavingDesc] = useState(false);
    const [descDirty, setDescDirty] = useState(false);
    const fileInputRef = React.useRef(null);

    const loadFiles = useCallback(async () => {
        if (!skill?.name) return;
        setLoading(true);
        try {
            const result = await fetchSkillFiles(skill.name);
            setFiles(result);
            setError(null);
        } catch (err) {
            console.error("Error loading skill files:", err);
            setError(err?.message || t("Failed to load skill files"));
        } finally {
            setLoading(false);
        }
    }, [skill?.name, fetchSkillFiles, t]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    const handleEditContent = async () => {
        try {
            const full = await getSkillContent(skill.name);
            setContentDraft(full?.content || "");
            setEditingContent(true);
        } catch (err) {
            setError(t("Failed to load skill content"));
        }
    };

    const handleSaveContent = async () => {
        setSavingContent(true);
        setError(null);
        try {
            await updateSkill(skill.name, { content: contentDraft });
            setEditingContent(false);
            await loadFiles();
        } catch (err) {
            setError(err.message);
        } finally {
            setSavingContent(false);
        }
    };

    const handleDescriptionSave = async () => {
        setSavingDesc(true);
        setError(null);
        try {
            const updated = await onDescriptionSave(skill.name, {
                description,
            });
            if (updated?.description !== undefined) {
                setDescription(updated.description);
            }
            setDescDirty(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setSavingDesc(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        setError(null);
        try {
            const result = await uploadSkillFile(skill.name, file);
            setFiles(result.files || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setUploadingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleFileDelete = async (filename) => {
        setError(null);
        try {
            const result = await deleteSkillFile(skill.name, filename);
            setFiles(result.files || []);
        } catch (err) {
            setError(err.message);
        }
    };

    // Find SKILL.md in the file list
    const skillMd = files.find(
        (f) => f.filename === "SKILL.md" || f.name?.endsWith("/SKILL.md"),
    );
    const otherFiles = files.filter(
        (f) => f.filename !== "SKILL.md" && !f.name?.endsWith("/SKILL.md"),
    );

    return (
        <div className="space-y-4" dir={direction}>
            <button
                onClick={onCancel}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
                <BackIcon className="h-4 w-4" />
                {t("Back to skills")}
            </button>

            {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* Skill name (read-only) */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("Name")}
                </label>
                <div className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                    {skill.name}
                </div>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 font-mono">
                    skills/{skill.name}/SKILL.md
                </p>
            </div>

            {/* Description (editable) */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("Description")}
                </label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => {
                            setDescription(e.target.value);
                            setDescDirty(true);
                        }}
                        className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {descDirty && (
                        <Button
                            size="sm"
                            onClick={handleDescriptionSave}
                            disabled={savingDesc}
                            aria-label={t("Save")}
                        >
                            {savingDesc ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t("skill_description_limit_guidance", {
                        max: SKILL_DESCRIPTION_MAX_LENGTH,
                    })}
                </p>
                <p
                    className={classNames(
                        "mt-0.5 text-xs tabular-nums",
                        splitSkillSummaryDescription(description).overflow
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-gray-400 dark:text-gray-500",
                    )}
                    dir="ltr"
                >
                    {t("skill_summary_character_count", {
                        current: description.length,
                        max: SKILL_DESCRIPTION_MAX_LENGTH,
                    })}
                </p>
            </div>

            {/* Inline SKILL.md editor */}
            {editingContent ? (
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        SKILL.md
                    </label>
                    <MarkdownEditor
                        value={contentDraft}
                        onChange={setContentDraft}
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingContent(false)}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSaveContent}
                            disabled={savingContent}
                        >
                            <Save className="me-1 h-4 w-4" />
                            {savingContent ? t("Saving...") : t("Save")}
                        </Button>
                    </div>
                </div>
            ) : (
                /* File browser */
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t("Files")}
                    </label>

                    {loading ? (
                        <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("Loading files...")}
                        </div>
                    ) : (
                        <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                            {/* SKILL.md — always first */}
                            <div
                                className={classNames(
                                    "flex items-center justify-between px-3 py-2",
                                    "bg-blue-50/50 dark:bg-blue-900/10",
                                    "border-b border-gray-200 dark:border-gray-700",
                                )}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="h-4 w-4 flex-shrink-0 text-blue-500" />
                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                        SKILL.md
                                    </span>
                                    {skillMd && (
                                        <span className="text-xs text-gray-400">
                                            {formatFileSize(skillMd.size || 0)}
                                        </span>
                                    )}
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleEditContent}
                                    className="h-7 px-2"
                                >
                                    <Pencil className="h-3.5 w-3.5 me-1" />
                                    {t("Edit")}
                                </Button>
                            </div>

                            {/* Other files */}
                            {otherFiles.map((file) => (
                                <div
                                    key={file.name || file.filename}
                                    className={classNames(
                                        "flex items-center justify-between px-3 py-2",
                                        "border-b border-gray-200 dark:border-gray-700 last:border-b-0",
                                        "bg-white dark:bg-gray-800",
                                    )}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                        <span className="text-sm truncate text-gray-700 dark:text-gray-300">
                                            {file.filename ||
                                                file.name?.split("/").pop()}
                                        </span>
                                        <span className="flex-shrink-0 text-xs text-gray-400">
                                            {formatFileSize(file.size || 0)}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() =>
                                            handleFileDelete(
                                                file.filename ||
                                                    file.name?.split("/").pop(),
                                            )
                                        }
                                        className="ms-2 flex-shrink-0 text-gray-400 hover:text-red-500"
                                        aria-label={t("Remove {{name}}", {
                                            name:
                                                file.filename ||
                                                file.name?.split("/").pop(),
                                        })}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}

                            {otherFiles.length === 0 && (
                                <div className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800">
                                    {t("No supporting files yet")}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Upload button */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile}
                    >
                        {uploadingFile ? (
                            <Loader2 className="me-1 h-3 w-3 animate-spin" />
                        ) : (
                            <Upload className="me-1 h-3 w-3" />
                        )}
                        {uploadingFile ? t("Uploading...") : t("Upload file")}
                    </Button>
                </div>
            )}
        </div>
    );
}

export function SkillsContent() {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const BackIcon = direction === "rtl" ? ChevronRight : ChevronLeft;
    const {
        builtInSkills,
        userSkills,
        loading,
        error,
        fetchSkills,
        createSkill,
        updateSkill,
        deleteSkill,
        getSkillContent,
        fetchSkillFiles,
        uploadSkillFile,
        deleteSkillFile,
    } = useSkills({ autoFetch: true });

    const [view, setView] = useState("list");
    const [editingSkill, setEditingSkill] = useState(null);
    const [viewingContent, setViewingContent] = useState(null);

    const handleEdit = useCallback(async (skill) => {
        if (skill.builtIn) {
            setViewingContent(skill);
            setView("view");
            return;
        }
        setEditingSkill(skill);
        setView("edit");
    }, []);

    const handleSaveNew = useCallback(
        async ({ name, description, content }) => {
            await createSkill({ name, description, content });
        },
        [createSkill],
    );

    const handleDelete = useCallback(
        async (name) => {
            if (
                !window.confirm(
                    t(
                        'Delete skill "{{name}}"? This will remove all skill files and cannot be undone.',
                        { name },
                    ),
                )
            )
                return;
            await deleteSkill(name);
        },
        [deleteSkill, t],
    );

    return (
        <>
            {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}

            {view === "list" && (
                <div className="space-y-4" dir={direction}>
                    <div>
                        <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t("Built-in skills")}
                        </h4>
                        <div className="space-y-2">
                            {builtInSkills.map((skill) => (
                                <div
                                    key={skill.name}
                                    className={classNames(
                                        "rounded-lg border p-3",
                                        "border-gray-200 dark:border-gray-600",
                                        "bg-white dark:bg-gray-800",
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium text-sm">
                                                {skill.name}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                                {skill.description}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                handleEdit({
                                                    ...skill,
                                                    builtIn: true,
                                                })
                                            }
                                        >
                                            {t("View")}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t("Your skills")}
                            </h4>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setView("new")}
                            >
                                <Plus className="me-1 h-3 w-3" />
                                {t("New skill")}
                            </Button>
                        </div>
                        {loading ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                                {t("Loading...")}
                            </p>
                        ) : userSkills.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {t(
                                    "No custom skills yet. Create one to teach the AI your workflows.",
                                )}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {userSkills.map((skill) => (
                                    <div
                                        key={skill.name}
                                        className={classNames(
                                            "rounded-lg border p-3",
                                            "border-gray-200 dark:border-gray-600",
                                            "bg-white dark:bg-gray-800",
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-sm">
                                                    {skill.name}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                                    {skill.description}
                                                </div>
                                                <div className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5 truncate">
                                                    skills/{skill.name}/SKILL.md
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 ms-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        handleEdit(skill)
                                                    }
                                                    aria-label={t("Edit")}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                    onClick={() =>
                                                        handleDelete(skill.name)
                                                    }
                                                    aria-label={t(
                                                        "Remove {{name}}",
                                                        { name: skill.name },
                                                    )}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {view === "new" && (
                <SkillCreateEditor
                    onSave={handleSaveNew}
                    onComplete={() => {
                        setView("list");
                        fetchSkills();
                    }}
                    onCancel={() => setView("list")}
                    uploadSkillFile={uploadSkillFile}
                />
            )}

            {view === "edit" && editingSkill && (
                <SkillFileBrowser
                    skill={editingSkill}
                    onCancel={() => {
                        setView("list");
                        fetchSkills();
                    }}
                    onDescriptionSave={(name, updates) =>
                        updateSkill(name, updates)
                    }
                    fetchSkillFiles={fetchSkillFiles}
                    uploadSkillFile={uploadSkillFile}
                    deleteSkillFile={deleteSkillFile}
                    getSkillContent={getSkillContent}
                    updateSkill={updateSkill}
                />
            )}

            {view === "view" && viewingContent && (
                <div className="space-y-4" dir={direction}>
                    <button
                        onClick={() => setView("list")}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                        <BackIcon className="h-4 w-4" />
                        {t("Back to skills")}
                    </button>
                    <div>
                        <h3 className="font-medium mb-1">
                            {viewingContent.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                            {viewingContent.description}
                        </p>
                        <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-3 max-h-96 overflow-y-auto">
                            <pre
                                className="text-xs font-mono whitespace-pre-wrap text-gray-700 dark:text-gray-300"
                                dir="ltr"
                            >
                                {viewingContent.content}
                            </pre>
                        </div>
                        <p className="mt-2 text-xs text-gray-400">
                            {t("Built-in skills cannot be edited.")}
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}

export default function SkillsDialog({ open, onOpenChange }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                dir={direction}
                className="sm:max-w-2xl max-h-[80vh] overflow-y-auto"
                onInteractOutside={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        {t("Skills")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("skills_dialog_description")}
                    </DialogDescription>
                </DialogHeader>
                {open && <SkillsContent />}
            </DialogContent>
        </Dialog>
    );
}
