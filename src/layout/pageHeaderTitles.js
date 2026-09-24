// Stable navigation labels also cover loading, empty and error states.
const titles = [
    ["/admin/sdk-playground", "SDK Playground"],
    ["/admin/style-guides", "Style Guides"],
    ["/admin/feedback", "Feedback"],
    ["/admin/queues", "Queue Monitoring"],
    ["/admin/users", "User Management"],
    ["/admin/usage", "Usage"],
    ["/admin", "Admin"],
    ["/home", "Home"],
    ["/chat", "Chat history"],
    ["/teams", "teams.title"],
    ["/colleagues", "colleagues.title"],
    ["/automations", "colleagues.title"],
    ["/files", "Files"],
    ["/apps", "Applet Library"],
    ["/applets", "Applet Library"],
    ["/published/applets", "Applets"],
    ["/published/workspaces", "Applet Workspaces"],
    ["/workspaces", "Applet Workspaces"],
    ["/media", "Media"],
    ["/images", "Media"],
    ["/video", "Transcription and translation"],
    ["/transcribe", "Transcription and translation"],
    ["/translate", "Translate"],
    ["/write", "Write"],
    ["/articles", "Write"],
    ["/notifications", "All notifications"],
    ["/help", "Help & Updates"],
    ["/privacy", "Privacy Policy"],
    ["/code", "Connectors"],
    ["/debug", "Debug"],
    ["/auth", "Sign in"],
];

export function getPageHeaderTitle(pathname) {
    return (
        titles.find(
            ([route]) =>
                pathname === route || pathname?.startsWith(`${route}/`),
        )?.[1] || "Concierge"
    );
}
