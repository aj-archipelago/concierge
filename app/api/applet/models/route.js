import { NextResponse } from "next/server";
import { getClient } from "../../../../src/graphql";
import { getCurrentUser } from "../../utils/auth.js";
import { validateAppletAccess } from "../access.js";
import { fetchAppletModelMetadata } from "../model-utils.js";
import { APPLET_SDK_LIMITS, withAppletSdkGuard } from "../sdk-guard.js";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const appletId = searchParams.get("appletId");

        if (!appletId) {
            return NextResponse.json(
                { error: "appletId is required" },
                { status: 400 },
            );
        }

        const user = await getCurrentUser();
        const accessError = await validateAppletAccess(appletId, user);
        if (accessError) {
            return accessError;
        }

        return await withAppletSdkGuard({
            appletId,
            userId: user._id,
            api: "models.list",
            limits: APPLET_SDK_LIMITS.read,
            run: async () => {
                const metadata = await fetchAppletModelMetadata(getClient());
                return NextResponse.json(metadata);
            },
        });
    } catch (error) {
        console.error("Error in applet models:", error);
        return NextResponse.json(
            { error: "Failed to load models" },
            { status: 500 },
        );
    }
}
