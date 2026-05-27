"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { User, Database, Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Sidebar Navigation Component
 */
function SidebarNav() {
    const { t } = useTranslation();
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    const navItems = [
        {
            path: "/debug/user-info",
            label: t("User Information"),
            icon: User,
        },
        {
            path: "/debug/user-state",
            label: t("User State"),
            icon: Database,
        },
    ];

    const isActive = (path) => pathname === path;

    const navContent = (
        <div className="p-2">
            {navItems.map((item) => {
                const Icon = item.icon;
                return (
                    <Link
                        key={item.path}
                        href={item.path}
                        onClick={() => setMobileOpen(false)}
                        className={`w-full text-start px-4 py-3 rounded-lg mb-1 transition-colors flex items-center gap-2 ${
                            isActive(item.path)
                                ? "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 font-medium"
                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {item.label}
                    </Link>
                );
            })}
        </div>
    );

    return (
        <>
            {/* Mobile toggle */}
            <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden fixed top-4 start-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-600"
                aria-label={t("Debug Menu")}
            >
                {mobileOpen ? (
                    <X className="h-5 w-5" />
                ) : (
                    <Menu className="h-5 w-5" />
                )}
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <nav
                className={`${
                    mobileOpen ? "translate-x-0" : "-translate-x-full"
                } md:translate-x-0 fixed md:static z-40 w-64 bg-white dark:bg-gray-800 border-e border-gray-200 dark:border-gray-600 flex-shrink-0 h-screen md:sticky top-0 overflow-y-auto transition-transform`}
            >
                <div className="p-4 border-b border-gray-200 dark:border-gray-600">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {t("Debug Menu")}
                    </h2>
                </div>
                {navContent}
            </nav>
        </>
    );
}

export default function DebugLayout({ children }) {
    const { t } = useTranslation();
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
            {/* Sidebar Navigation */}
            <SidebarNav />

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6">
                    {/* Header */}
                    <div className="mb-6 ms-10 md:ms-0">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                            {t("Debug: User Account Data")}
                        </h1>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                            {t("View your account data and preferences")}
                        </p>
                    </div>

                    {/* Content */}
                    {children}
                </div>
            </div>
        </div>
    );
}
