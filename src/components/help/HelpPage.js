"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, FileText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useContext } from "react";
import { useTranslation } from "react-i18next";
import HelpGuidesList from "./HelpGuidesList";
import ReleaseNotesList from "./ReleaseNotesList";
import { LanguageContext } from "../../contexts/LanguageProvider";

function HelpPageContent() {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const searchParams = useSearchParams();
    const tab = searchParams?.get("tab") || "guides";
    const item = searchParams?.get("item") || null;

    return (
        <div dir={direction} className="p-4 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                {t("Help & Updates")}
            </h1>
            <Tabs defaultValue={tab}>
                <TabsList>
                    <TabsTrigger value="guides" className="gap-1.5">
                        <BookOpen className="h-4 w-4" />
                        {t("How-To's")}
                    </TabsTrigger>
                    <TabsTrigger value="releases" className="gap-1.5">
                        <FileText className="h-4 w-4" />
                        {t("Release Notes")}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="guides" className="mt-4">
                    <HelpGuidesList />
                </TabsContent>
                <TabsContent value="releases" className="mt-4">
                    <ReleaseNotesList
                        initialItem={tab === "releases" ? item : null}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default function HelpPage() {
    return (
        <Suspense>
            <HelpPageContent />
        </Suspense>
    );
}
