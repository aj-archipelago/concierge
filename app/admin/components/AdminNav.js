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
    ];

    return (
        <nav className="flex space-x-8 sm:ml-6">
            {navigation.map((item) => (
                <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                        "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium",
                        pathname === item.href
                            ? "border-sky-500 text-gray-900"
                            : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
                    )}
                >
                    {item.name}
                </Link>
            ))}
        </nav>
    );
}
