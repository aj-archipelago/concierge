import { headers } from "next/headers";
import config from "../../config";

export const getCurrentUser = async () => {
    const auth = config.auth;

    if (!auth.provider) {
        return;
    }

    if (auth.provider !== "entra") {
        throw new Error(`Unsupported auth provider: ${auth.provider}`);
    }

    const headerList = headers();

    const name = headerList.get("X-MS-CLIENT-PRINCIPAL-NAME") || "Anonymous";
    const id = headerList.get("X-MS-CLIENT-PRINCIPAL-ID") || "";
    const initials = name
        .split(" ")
        .map((n) => n[0]?.toUpperCase() || "")
        .join("");

    return {
        id,
        name,
        initials,
    };
};
