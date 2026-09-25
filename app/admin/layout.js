import React from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "../api/utils/auth";

export default async function AdminLayout({ children }) {
    const user = await getCurrentUser();

    if (!user) {
        return redirect("/");
    }

    const headerList = await headers();
    const host =
        headerList.get("x-forwarded-host") || headerList.get("host") || "";
    const hostname = host.split(",")[0].trim().split(":")[0].toLowerCase();
    const isLocalhost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname === "::1";

    if (!isLocalhost && user.role !== "admin") {
        return redirect("/");
    }

    return (
        <div className="min-h-full bg-gray-100 dark:bg-gray-900">
            <main className="max-w-7xl mx-auto py-2 sm:px-6 lg:px-8 overflow-auto bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                {children}
            </main>
        </div>
    );
}
