import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import {
    companionAdmin,
    requireCompanionOrigin,
} from "../../../utils/companion";

export const dynamic = "force-dynamic";
const failure = (error) =>
    NextResponse.json(
        { error: "Computer connection could not be updated" },
        { status: error.status || 503 },
    );

export async function GET() {
    try {
        return NextResponse.json(
            await companionAdmin(await getCurrentUser(false), "devices"),
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return failure(error);
    }
}
export async function POST(request) {
    try {
        requireCompanionOrigin(request);
        const user = await getCurrentUser(false);
        const { code } = await request.json();
        if (typeof code !== "string" || !/^[a-fA-F0-9\s-]{12,20}$/.test(code))
            return NextResponse.json(
                { error: "Invalid pairing code" },
                { status: 400 },
            );
        return NextResponse.json(await companionAdmin(user, "pair", { code }));
    } catch (error) {
        return failure(error);
    }
}
export async function DELETE(request) {
    try {
        requireCompanionOrigin(request);
        const user = await getCurrentUser(false);
        const { deviceId } = await request.json();
        if (
            typeof deviceId !== "string" ||
            !/^[a-zA-Z0-9_-]{1,80}$/.test(deviceId)
        )
            return NextResponse.json(
                { error: "Invalid computer" },
                { status: 400 },
            );
        return NextResponse.json(
            await companionAdmin(user, "revoke", { deviceId }),
        );
    } catch (error) {
        return failure(error);
    }
}
