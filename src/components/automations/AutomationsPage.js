"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import AutomationList from "./AutomationList";
import AutomationEditor from "./AutomationEditor";
import CreateAutomationDialog from "./CreateAutomationDialog";
import { useAutomations } from "../../hooks/useAutomations";

export default function AutomationsPage() {
    const { t } = useTranslation();
    const { data: automations = [], isLoading } = useAutomations();
    const [selectedId, setSelectedId] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);

    useEffect(() => {
        if (!selectedId && automations.length > 0) {
            setSelectedId(automations[0]._id);
        }
    }, [automations, selectedId]);

    const handleCreated = (id, { customize }) => {
        setSelectedId(id);
        if (customize) {
            // Already showing the editor for `id`; nothing else to do.
        }
    };

    const handleDeleted = () => {
        setSelectedId(
            automations.find((item) => item._id !== selectedId)?._id || null,
        );
    };

    if (isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        );
    }

    const isEmpty = automations.length === 0;

    return (
        <div className="p-4 sm:p-6">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                        {t("Automations")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t(
                            "Schedule Concierge to run tasks on its own - daily briefs, hourly checks, and more.",
                        )}
                    </p>
                </div>
                <Button type="button" onClick={() => setCreateOpen(true)}>
                    <Sparkles className="me-1.5 h-4 w-4" />
                    {t("New automation")}
                </Button>
            </div>

            {isEmpty ? (
                <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 dark:bg-sky-900/30">
                        <Sparkles className="h-6 w-6 text-sky-600 dark:text-sky-300" />
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {t("Create your first automation")}
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                        {t(
                            'Describe what you want Concierge to do - like "summarize unread emails every weekday at 8am" - and we\'ll set up the rest.',
                        )}
                    </p>
                    <Button
                        type="button"
                        className="mt-4"
                        onClick={() => setCreateOpen(true)}
                    >
                        <Sparkles className="me-1.5 h-4 w-4" />
                        {t("New automation")}
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
                    <AutomationList
                        automations={automations}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onCreate={() => setCreateOpen(true)}
                    />
                    {selectedId ? (
                        <AutomationEditor
                            key={selectedId}
                            selectedId={selectedId}
                            onDeleted={handleDeleted}
                        />
                    ) : (
                        <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-sm text-gray-500 dark:text-gray-400">
                            {t("Select an automation to view its details.")}
                        </div>
                    )}
                </div>
            )}

            <CreateAutomationDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreated={handleCreated}
            />
        </div>
    );
}
