import App, { APP_STATUS } from "../models/app";

export async function GET() {
    try {
        // Fetch all active apps and populate the author field
        const apps = await App.find({
            status: APP_STATUS.ACTIVE,
        })
            .populate("author", "username email")
            .sort({
                name: 1,
            });

        return Response.json(apps);
    } catch (error) {
        console.error("Error fetching apps:", error);
        return Response.json(
            { error: "Failed to fetch apps: " + error.message },
            { status: 500 },
        );
    }
}
