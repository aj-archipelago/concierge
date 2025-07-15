"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import WorkspaceContent from "../../components/WorkspaceContent";
import WorkspaceApplet from "./WorkspaceApplet";

export default function WorkspaceTabs({ idOrSlug, user }) {
    const { t } = useTranslation();

    return (
        <Tabs
            defaultValue="prompts"
            className="w-full flex flex-col gap-2 h-full overflow-auto"
        >
            <TabsList className="w-full justify-start">
                <TabsTrigger value="prompts">{t("Prompts")}</TabsTrigger>
                <TabsTrigger value="ui">{t("Applet")}</TabsTrigger>
            </TabsList>
            <TabsContent value="prompts">
                <WorkspaceContent idOrSlug={idOrSlug} user={user} />
            </TabsContent>
            <TabsContent value="ui" className="grow overflow-auto">
                <WorkspaceApplet />
            </TabsContent>
        </Tabs>
    );
}
