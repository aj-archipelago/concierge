"use client";

import PageHeader from "../../layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useContext } from "react";
import { useTranslation } from "react-i18next";
import HelpGuidesList from "./HelpGuidesList";
import ReleaseNotesList from "./ReleaseNotesList";
import { LanguageContext } from "../../contexts/LanguageProvider";

function HelpPageContent() {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const searchParams = useSearchParams();
    const router = useRouter();
    const tab = searchParams?.get("tab") === "releases" ? "releases" : "guides";
    const item = searchParams?.get("item") || null;

    return (
        <div dir={direction} className="p-4 max-w-4xl mx-auto">
            <Tabs
                value={tab}
                dir={direction}
                onValueChange={(value) => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("tab", value);
                    params.delete("item");
                    router.push(`/help?${params}`, { scroll: false });
                }}
            >
                <PageHeader title={t("Help & Updates")}>
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
                </PageHeader>
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
