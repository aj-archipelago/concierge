import { getCurrentUser } from "../../utils/auth";
import { reconcileUserApps, SIDEBAR_APPS_SCHEMA_VERSION } from "./sidebar-apps";

export async function GET() {
    const user = await getCurrentUser(false); // Get the mongoose object, not JSON

    await reconcileUserApps(user);

    // Populate app details
    await user.populate("apps.appId");

    // Convert to JSON for response
    const userJson = JSON.parse(JSON.stringify(user.toJSON()));
    return Response.json(userJson);
}

export async function PUT(request) {
    try {
        const user = await getCurrentUser(false);
        const data = await request.json();

        // Update user fields
        if (Array.isArray(data.apps)) {
            user.apps = data.apps;
            user.sidebarAppsVersion = SIDEBAR_APPS_SCHEMA_VERSION;
        }

        await user.save();

        // Populate app details for response
        await user.populate("apps.appId");

        const userJson = JSON.parse(JSON.stringify(user.toJSON()));
        return Response.json(userJson);
    } catch (error) {
        console.error("Error updating user:", error);
        return Response.json(
            { error: "Failed to update user" },
            { status: 500 },
        );
    }
}

// don't want nextjs to cache this endpoint
export const dynamic = "force-dynamic";
