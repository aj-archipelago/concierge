export async function deleteAppletUserFileFromWorkspace({
    workspaceId,
    filename,
}) {
    const resolvedWorkspaceId = workspaceId ? String(workspaceId) : "";
    const resolvedFilename = filename ? String(filename) : "";

    if (!resolvedWorkspaceId || !resolvedFilename) {
        throw new Error("Workspace ID and filename are required");
    }

    const deleteUrl = `/api/workspaces/${encodeURIComponent(
        resolvedWorkspaceId,
    )}/applet/files?filename=${encodeURIComponent(resolvedFilename)}`;
    const response = await fetch(deleteUrl, { method: "DELETE" });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to delete applet file");
    }

    return response;
}
