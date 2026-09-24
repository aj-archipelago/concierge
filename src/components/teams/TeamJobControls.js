"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useCancelTask } from "../../../app/queries/notifications";
import { isTeamActive } from "../../utils/assistantTeamStatus";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
export default function TeamJobControls({ team }) {
    const [open, setOpen] = useState(false);
    const { t } = useTranslation();
    const cancel = useCancelTask();
    const client = useQueryClient();
    if (!isTeamActive(team)) return null;
    return (
        <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={cancel.isPending}
                className="min-h-10 rounded-lg px-3 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
                {t("teams.stopJob")}
            </button>
            {cancel.isError && (
                <p
                    role="alert"
                    className="mt-1 text-sm text-red-700 dark:text-red-300"
                >
                    {t("teams.stopError")}
                </p>
            )}
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("teams.stopJob")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("teams.stopDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t("teams.keepWorking")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() =>
                                cancel.mutate(team.teamId, {
                                    onSuccess: () => {
                                        client.invalidateQueries({
                                            queryKey: ["assistant-team"],
                                        });
                                        client.invalidateQueries({
                                            queryKey: ["assistant-teams"],
                                        });
                                    },
                                })
                            }
                        >
                            {t("teams.stopJob")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
