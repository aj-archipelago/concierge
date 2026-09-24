import { createAppletGenerationResponse } from "../utils/generate-applet-response";

export const dynamic = "force-dynamic";

export async function POST(request) {
    return createAppletGenerationResponse(request);
}
