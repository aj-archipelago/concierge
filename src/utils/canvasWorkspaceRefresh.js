export function isAppletDraftWorkspacePath(workspacePath) {
    return (
        typeof workspacePath === "string" &&
        workspacePath.startsWith("/workspace/files/applets/") &&
        !workspacePath.includes("/versions/")
    );
}

export function buildHtmlWorkspaceRefreshContent(
    tabContent = {},
    htmlContent,
    now = Date.now,
) {
    if (typeof htmlContent !== "string" || !htmlContent) {
        return null;
    }

    const htmlChanged = tabContent.htmlContent !== htmlContent;
    const statusChanged = tabContent.htmlStatus !== "live";
    if (!htmlChanged && !statusChanged) {
        return null;
    }

    const nextContent = {
        htmlContent,
        htmlStatus: "live",
    };

    if (
        htmlChanged &&
        tabContent.type === "html" &&
        tabContent.appletId &&
        isAppletDraftWorkspacePath(tabContent.workspacePath)
    ) {
        nextContent.workspaceContentVersion = now();
        nextContent.appletActiveVersionIndex = null;
        nextContent.appletActiveVersionNumber = null;
        nextContent.appletIsViewingDraft = true;
    }

    return nextContent;
}
