"use client";

import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { AuthContext } from "../../App";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useUpdateAiOptions } from "../../../app/queries/options";
import { MemoryEditorContent } from "../MemoryEditor";

export default function MemorySection() {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";

    const updateAiOptionsMutation = useUpdateAiOptions();
    const [aiMemorySelfModify, setAiMemorySelfModify] = useState(
        user?.aiMemorySelfModify || false,
    );

    useEffect(() => {
        if (user) {
            setAiMemorySelfModify(user.aiMemorySelfModify || false);
        }
    }, [user]);

    const handleToggle = async (checked) => {
        setAiMemorySelfModify(checked);
        try {
            await updateAiOptionsMutation.mutateAsync({
                userId: user.userId,
                contextId: user.contextId,
                aiMemorySelfModify: checked,
                aiName: user.aiName,
                agentModel: user.agentModel,
                useCustomEntities: user.useCustomEntities,
                reasoningEffort: user.reasoningEffort,
            });
        } catch (err) {
            console.error("Error saving memory setting:", err);
            setAiMemorySelfModify(!checked);
        }
    };

    return (
        <div className="space-y-4">
            <div
                className={`flex gap-2 items-center ${isRTL ? "flex-row-reverse justify-end" : ""}`}
            >
                <input
                    type="checkbox"
                    id="portal-aiMemorySelfModify"
                    className={`accent-sky-500 ${isRTL ? "order-2" : ""}`}
                    checked={aiMemorySelfModify}
                    onChange={(e) => handleToggle(e.target.checked)}
                />
                <label
                    htmlFor="portal-aiMemorySelfModify"
                    className={`text-sm text-gray-900 dark:text-gray-100 cursor-pointer ${isRTL ? "order-1" : ""}`}
                    dir={direction}
                >
                    {t("Allow the AI to modify its own memory")}
                </label>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            <MemoryEditorContent
                user={user}
                aiName={user?.aiName || "Concierge"}
                onSaved={() => toast.success(t("Memory saved"))}
                onClose={() => {}}
            />
        </div>
    );
}
