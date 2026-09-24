import { NextResponse } from "next/server";
import { companionSettings } from "../../utils/companion";

export const dynamic = "force-dynamic";

// Public service discovery for the native app. Contains no account data or keys.
export async function GET() {
    const settings = companionSettings();
    const downloads = {};
    for (const [platform, variable] of Object.entries({
        mac: "COMPANION_DOWNLOAD_MAC",
        windows: "COMPANION_DOWNLOAD_WINDOWS",
    })) {
        const value = process.env[variable];
        if (value && new URL(value).protocol === "https:")
            downloads[platform] = value;
    }
    return NextResponse.json(
        { enabled: Boolean(settings), relayUrl: settings?.relayUrl, downloads },
        { headers: { "Cache-Control": "no-store" } },
    );
}
