import { isRequestAuthorized } from "./app/api/utils/requestAuthorization";

export const config = {
    matcher:
        "/((?!graphql(?:/|$)|media-helper(?:/|$)|api/agent-tools(?:/|$)).*)",
};

export function proxy(request) {
    if (!isRequestAuthorized(request)) {
        return Response.json(
            { success: false, message: "Unauthorized" },
            { status: 401 },
        );
    }
}
