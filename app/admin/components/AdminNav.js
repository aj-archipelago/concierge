"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useContext } from "react";
import { ChevronDown } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";

export default function AdminNav() {
    const pathname = usePathname();
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const navigation = [
        ["Queues", "/admin/queues"],
        ["Users", "/admin/users"],
        ["Feedback", "/admin/feedback"],
        ["Style Guides", "/admin/style-guides"],
        ["Usage", "/admin/usage"],
        ["SDK Playground", "/admin/sdk-playground"],
    ];
    return (
        <DropdownMenu dir={direction}>
            <DropdownMenuTrigger
                className="flex h-10 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label={t("Admin pages")}
            >
                {t("Admin")}
                <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" dir={direction}>
                {navigation.map(([name, href]) => (
                    <DropdownMenuItem asChild key={href}>
                        <Link
                            href={href}
                            aria-current={
                                pathname === href ? "page" : undefined
                            }
                            className="min-h-10"
                        >
                            {t(name)}
                        </Link>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
