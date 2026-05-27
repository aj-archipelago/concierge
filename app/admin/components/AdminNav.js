"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

export default function AdminNav() {
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (pathname === "/admin") {
            router.push("/admin/queues");
        }
    }, [pathname, router]);

    const navigation = [
        { name: "Queues", href: "/admin/queues" },
        { name: "Users", href: "/admin/users" },
        { name: "Feedback", href: "/admin/feedback" },
        { name: "Style Guides", href: "/admin/style-guides" },
        { name: "Usage", href: "/admin/usage" },
        { name: "SDK Playground", href: "/admin/sdk-playground" },
    ];

    return (
        <nav className="flex gap-6 overflow-x-auto sm:ms-6">
            {navigation.map((item) => (
                <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                        "inline-flex min-h-10 shrink-0 items-center border-b-2 px-1 pt-1 text-sm font-medium",
                        pathname === item.href
                            ? "border-sky-500 text-gray-900 dark:text-gray-100"
                            : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200",
                    )}
                >
                    {item.name}
                </Link>
            ))}
        </nav>
    );
}
