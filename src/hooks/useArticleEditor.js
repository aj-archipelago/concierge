"use client";

import {
    useReducer,
    useCallback,
    useEffect,
    useRef,
    useMemo,
    useContext,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { uploadFileToMediaHelper } from "../utils/fileUploadUtils";
import { deleteFileFromCloud } from "../../app/workspaces/[id]/components/chatFileUtils";
import { createArticleStorageTarget } from "../utils/storageTargets";
import config from "../../config";
import { AuthContext, ServerContext } from "../App";

const initialState = {
    headline: "",
    subhead: "",
    content: "",
    featuredImageUrl: "",
    fileHash: null,
    blobPath: null,
    filename: null,
    originalState: null,
    isLoading: false,
    isSaving: false,
    isDeleting: false,
};

function reducer(state, action) {
    switch (action.type) {
        case "LOAD_START":
            return { ...state, isLoading: true };
        case "LOAD_SUCCESS": {
            const { headline, subhead, content, featuredImageUrl } =
                action.payload;
            return {
                ...state,
                ...action.payload,
                isLoading: false,
                originalState: {
                    headline,
                    subhead,
                    content,
                    featuredImageUrl,
                },
            };
        }
        case "LOAD_ERROR":
            return { ...state, isLoading: false };
        case "UPDATE":
            return { ...state, ...action.payload };
        case "SYNC_ORIGINAL":
            return state.originalState
                ? {
                      ...state,
                      originalState: {
                          ...state.originalState,
                          ...action.payload,
                      },
                  }
                : state;
        case "REVERT":
            return state.originalState
                ? { ...state, ...state.originalState }
                : {
                      ...state,
                      headline: "",
                      subhead: "",
                      content: "",
                      featuredImageUrl: "",
                  };
        case "SAVE_START":
            return { ...state, isSaving: true };
        case "SAVE_SUCCESS": {
            const { headline, subhead, content, featuredImageUrl } = state;
            return {
                ...state,
                ...action.payload,
                isSaving: false,
                originalState: {
                    headline,
                    subhead,
                    content,
                    featuredImageUrl,
                },
            };
        }
        case "SAVE_ERROR":
            return { ...state, isSaving: false };
        case "DELETE_START":
            return { ...state, isDeleting: true };
        case "DELETE_SUCCESS":
            return { ...initialState };
        case "DELETE_ERROR":
            return { ...state, isDeleting: false };
        default:
            return state;
    }
}

export function parseArticleHTML(htmlContent) {
    try {
        const unescapeHTML = (str) => {
            if (!str) return "";
            const textarea = document.createElement("textarea");
            textarea.innerHTML = str;
            return textarea.value;
        };

        const titleMatch =
            htmlContent.match(
                /<meta\s+id=["']title["']\s+content=["']([^"']*)["']/i,
            ) ||
            htmlContent.match(/<meta\s+id=["']title["']\s+content=([^\s>]+)/i);
        const title = titleMatch ? unescapeHTML(titleMatch[1]) : "";

        const subheadMatch =
            htmlContent.match(
                /<meta\s+id=["']subhead["']\s+content=["']([^"']*)["']/i,
            ) ||
            htmlContent.match(
                /<meta\s+id=["']subhead["']\s+content=([^\s>]+)/i,
            );
        const subhead = subheadMatch ? unescapeHTML(subheadMatch[1]) : "";

        const featuredImageMatch =
            htmlContent.match(
                /<meta\s+id=["']featuredImage["']\s+content=["']([^"']*)["']/i,
            ) ||
            htmlContent.match(
                /<meta\s+id=["']featuredImage["']\s+content=([^\s>]+)/i,
            );
        const featuredImage = featuredImageMatch
            ? unescapeHTML(featuredImageMatch[1])
            : "";

        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1].trim() : "";

        return { title, subhead, bodyContent, featuredImage };
    } catch (error) {
        console.error("Error parsing article HTML:", error);
        return { title: "", subhead: "", bodyContent: "", featuredImage: "" };
    }
}

function buildArticleHTML(headline, subhead, body, featuredImage) {
    const escapeHTML = (str) =>
        (str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    const escapedTitle = escapeHTML(headline);
    const escapedSubhead = escapeHTML(subhead);
    const escapedFeaturedImage = escapeHTML(featuredImage);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="concierge-type" content="article">
    <meta id="title" content="${escapedTitle}">
    <meta id="subhead" content="${escapedSubhead}">
    <meta id="featuredImage" content="${escapedFeaturedImage}">
    <title>${escapedTitle || "Untitled Article"}</title>
</head>
<body>
${body || ""}
</body>
</html>`;
}

function deriveFilenameFromWorkspacePath(workspacePath) {
    if (!workspacePath) return null;
    return workspacePath.split("/").pop() || null;
}

// Normalize HTML for comparison — TipTap may emit slightly different markup
// (whitespace, empty tags, trailing <br>) on init without user edits.
function normalizeForComparison(str) {
    if (!str || typeof str !== "string") return "";
    return str
        .replace(/<br\s*\/?>/gi, "")
        .replace(/<p>\s*<\/p>/gi, "")
        .trim()
        .replace(/\s+/g, " ");
}

function isContentEffectivelyEmpty(content) {
    if (!content) return true;
    let stripped = content.replace(/<br\s*\/?>/gi, "");
    let prev;
    do {
        prev = stripped;
        stripped = stripped.replace(/<[^>]*>/g, "");
    } while (stripped !== prev);
    return stripped.replace(/&nbsp;/g, " ").trim().length === 0;
}

/**
 * useArticleEditor — workspace-file-canonical article editor.
 *
 * The article HTML file at `workspacePath` is the single source of truth.
 * The hook fetches it on mount and whenever `contentVersion` changes, and
 * writes back via the article storage target on save. Agent edits happen
 * by writing the file directly through the workspace shell — bumping
 * `contentVersion` re-reads the file into the editor.
 *
 * @param {string|null} workspacePath - e.g. "/workspace/files/articles/foo.html"
 * @param {number|null} contentVersion - bump to force a reload from the file
 */
export function useArticleEditor(workspacePath, contentVersion) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { serverUrl } = useContext(ServerContext);
    const baseContextId = user?.contextId || null;

    const [state, dispatch] = useReducer(reducer, initialState);
    const stateRef = useRef(state);
    const abortRef = useRef(null);
    const pendingEditorSyncRef = useRef(false);
    const editorSyncDeadlineRef = useRef(0);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    // Load the file when workspacePath or contentVersion changes.
    useEffect(() => {
        if (!workspacePath) {
            return;
        }

        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const signal = abortRef.current.signal;

        dispatch({ type: "LOAD_START" });

        (async () => {
            try {
                const params = new URLSearchParams({ path: workspacePath });
                const res = await fetch(`/api/workspace/file?${params}`, {
                    signal,
                });

                if (signal.aborted) return;

                if (res.status === 404) {
                    // File doesn't exist yet — empty editor at this path.
                    dispatch({
                        type: "LOAD_SUCCESS",
                        payload: {
                            headline: "",
                            subhead: "",
                            content: "",
                            featuredImageUrl: "",
                            filename:
                                deriveFilenameFromWorkspacePath(workspacePath),
                        },
                    });
                    pendingEditorSyncRef.current = true;
                    editorSyncDeadlineRef.current = Date.now() + 800;
                    return;
                }

                if (!res.ok) {
                    throw new Error(
                        `Failed to load article (${res.status} ${res.statusText})`,
                    );
                }

                const html = await res.text();
                if (signal.aborted) return;
                const parsed = parseArticleHTML(html);

                dispatch({
                    type: "LOAD_SUCCESS",
                    payload: {
                        headline: parsed.title || "",
                        subhead: parsed.subhead || "",
                        content: parsed.bodyContent || "",
                        featuredImageUrl: parsed.featuredImage || "",
                        filename:
                            deriveFilenameFromWorkspacePath(workspacePath),
                    },
                });
                pendingEditorSyncRef.current = true;
                editorSyncDeadlineRef.current = Date.now() + 800;
            } catch (err) {
                if (err.name === "AbortError") return;
                console.error("Error loading article:", err);
                toast.error(err.message || t("Failed to load article"));
                dispatch({ type: "LOAD_ERROR" });
            }
        })();

        return () => {
            abortRef.current?.abort();
        };
    }, [workspacePath, contentVersion, t]);

    // New article tabs can open before the agent's workspace write has landed.
    // Keep checking briefly while the editor is still empty so the draft appears
    // without requiring a page refresh.
    useEffect(() => {
        if (!workspacePath) return;

        const isStillEmpty = () => {
            const cur = stateRef.current;
            return (
                !cur.headline &&
                !cur.subhead &&
                !cur.featuredImageUrl &&
                isContentEffectivelyEmpty(cur.content)
            );
        };

        if (!isStillEmpty()) return;

        let attempts = 0;
        let cancelled = false;
        const maxAttempts = 20;

        const pollForDraft = async () => {
            if (cancelled || !isStillEmpty()) return;
            attempts += 1;

            try {
                const params = new URLSearchParams({ path: workspacePath });
                const res = await fetch(`/api/workspace/file?${params}`);
                if (cancelled || !res.ok) return;

                const html = await res.text();
                if (cancelled || !html?.trim()) return;

                const parsed = parseArticleHTML(html);
                if (
                    !parsed.title &&
                    !parsed.subhead &&
                    isContentEffectivelyEmpty(parsed.bodyContent) &&
                    !parsed.featuredImage
                ) {
                    return;
                }

                dispatch({
                    type: "LOAD_SUCCESS",
                    payload: {
                        headline: parsed.title || "",
                        subhead: parsed.subhead || "",
                        content: parsed.bodyContent || "",
                        featuredImageUrl: parsed.featuredImage || "",
                        filename:
                            deriveFilenameFromWorkspacePath(workspacePath),
                    },
                });
                pendingEditorSyncRef.current = true;
                editorSyncDeadlineRef.current = Date.now() + 800;
            } catch {
                // Best-effort only. The normal editor load path owns errors.
            }
        };

        const interval = setInterval(() => {
            if (attempts >= maxAttempts || !isStillEmpty()) {
                clearInterval(interval);
                return;
            }
            pollForDraft();
        }, 1000);

        pollForDraft();

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [workspacePath, contentVersion]);

    // Editor sometimes emits normalized HTML on init (TipTap). Absorb those
    // updates into originalState so hasChanges stays false until the user
    // actually edits.
    const updateContent = useCallback((updates) => {
        const isContentOnlyUpdate =
            updates &&
            typeof updates === "object" &&
            "content" in updates &&
            Object.keys(updates).length === 1;

        const withinSyncWindow =
            pendingEditorSyncRef.current &&
            Date.now() <= editorSyncDeadlineRef.current;

        if (withinSyncWindow && isContentOnlyUpdate) {
            dispatch({ type: "UPDATE", payload: updates });
            dispatch({
                type: "SYNC_ORIGINAL",
                payload: { content: updates.content },
            });
            return;
        }
        if (pendingEditorSyncRef.current) {
            pendingEditorSyncRef.current = false;
        }
        dispatch({ type: "UPDATE", payload: updates });
    }, []);

    const revertChanges = useCallback(() => {
        dispatch({ type: "REVERT" });
        pendingEditorSyncRef.current = true;
        editorSyncDeadlineRef.current = Date.now() + 800;
    }, []);

    const saveFile = useCallback(async () => {
        const cur = stateRef.current;

        if (!workspacePath) {
            toast.error(t("Unable to save: no article path"));
            return null;
        }
        if (!baseContextId) {
            toast.error(t("Unable to save: User context not available"));
            return null;
        }
        if (!cur.headline || !cur.headline.trim()) {
            toast.error(t("Please enter a headline to save"));
            return null;
        }

        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const signal = abortRef.current.signal;

        dispatch({ type: "SAVE_START" });

        try {
            const html = buildArticleHTML(
                cur.headline,
                cur.subhead,
                cur.content,
                cur.featuredImageUrl,
            );
            const filename = deriveFilenameFromWorkspacePath(workspacePath);
            const blob = new Blob([html], { type: "text/html" });
            const file = new File([blob], filename, { type: "text/html" });

            const result = await uploadFileToMediaHelper(file, {
                storageTarget: createArticleStorageTarget(baseContextId),
                checkHash: false,
                serverUrl: config.endpoints.mediaHelper(serverUrl),
            });

            if (signal.aborted) return null;
            if (!result?.hash) throw new Error("Upload failed");

            dispatch({
                type: "SAVE_SUCCESS",
                payload: {
                    fileHash: result.hash,
                    blobPath: result.blobPath || null,
                    filename: result.displayFilename || filename,
                },
            });
            toast.success(t("Article saved successfully"));

            return {
                fileHash: result.hash,
                blobPath: result.blobPath || null,
                filename: result.displayFilename || filename,
            };
        } catch (err) {
            if (err.name === "AbortError") return null;
            console.error("Error saving article:", err);
            toast.error(err.message || t("Failed to save article"));
            dispatch({ type: "SAVE_ERROR" });
            throw err;
        }
    }, [workspacePath, baseContextId, serverUrl, t]);

    const deleteFile = useCallback(
        async (file) => {
            const hash = file?.hash || stateRef.current.fileHash;
            const blobPath = file?.blobPath || stateRef.current.blobPath;
            if (!hash && !blobPath) {
                toast.error(t("Invalid article file"));
                return;
            }
            if (!baseContextId) {
                toast.error(t("Unable to delete: User context not available"));
                return;
            }

            dispatch({ type: "DELETE_START" });
            try {
                await deleteFileFromCloud({
                    hash,
                    blobPath,
                    contextId: baseContextId,
                });
                dispatch({ type: "DELETE_SUCCESS" });
                toast.success(t("File deleted successfully"));
            } catch (err) {
                console.error("Error deleting article:", err);
                toast.error(err.message || t("Failed to delete file"));
                dispatch({ type: "DELETE_ERROR" });
            }
        },
        [baseContextId, t],
    );

    const hasChanges = useMemo(() => {
        if (!state.originalState) {
            return !!(
                state.headline ||
                state.subhead ||
                !isContentEffectivelyEmpty(state.content) ||
                state.featuredImageUrl
            );
        }
        const contentSame =
            normalizeForComparison(state.content) ===
            normalizeForComparison(state.originalState.content);
        return (
            state.headline !== state.originalState.headline ||
            state.subhead !== state.originalState.subhead ||
            !contentSame ||
            state.featuredImageUrl !== state.originalState.featuredImageUrl
        );
    }, [state]);

    const isNewStory = !state.fileHash;

    const documentStatus = useMemo(
        () => ({
            isDirty: hasChanges,
            isLoading: state.isLoading,
            isSaving: state.isSaving,
            canSave: hasChanges && !state.isSaving,
            canRevert: hasChanges && !state.isSaving,
            isNewStory,
        }),
        [hasChanges, state.isLoading, state.isSaving, isNewStory],
    );

    const operations = useMemo(
        () => ({
            updateContent,
            revertChanges,
            saveFile,
            deleteFile,
        }),
        [updateContent, revertChanges, saveFile, deleteFile],
    );

    return {
        state: {
            headline: state.headline,
            subhead: state.subhead,
            content: state.content,
            featuredImageUrl: state.featuredImageUrl,
            fileHash: state.fileHash,
            blobPath: state.blobPath,
            filename: state.filename,
        },
        operations,
        loading: {
            isLoading: state.isLoading,
            isSaving: state.isSaving,
            isDeleting: state.isDeleting,
        },
        documentStatus,
        hasChanges,
        isNewStory,
    };
}
