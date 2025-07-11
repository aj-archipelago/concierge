import { getCurrentUser } from "../../utils/auth";
import App, { APP_TYPES, APP_STATUS } from "../../models/app";

export async function GET() {
    const user = await getCurrentUser(false); // Get the mongoose object, not JSON

    // Initialize user's apps if they don't have any
    if (!user.apps || user.apps.length === 0) {
        await initializeUserApps(user);
    }

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
        if (data.apps) {
            user.apps = data.apps;
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

async function initializeUserApps(user) {
    // Get the default apps (excluding Home and Chat as they're core navigation)
    const defaultAppSlugs = [
        "translate",
        "video",
        "write",
        "workspaces",
        "media",
        "jira",
    ];

    // Find the active apps by slug
    const apps = await App.find({
        slug: { $in: defaultAppSlugs },
        type: APP_TYPES.NATIVE,
        status: APP_STATUS.ACTIVE,
    });

    // Create the apps array with order
    const userApps = apps.map((app, index) => ({
        appId: app._id,
        order: index,
        addedAt: new Date(),
    }));

    // Update the user with the default apps
    user.apps = userApps;
    await user.save();

    console.log(
        `Initialized ${userApps.length} default apps for user ${user.userId}`,
    );
}

// don't want nextjs to cache this endpoint
export const dynamic = "force-dynamic";
