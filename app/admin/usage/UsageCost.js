import { useTranslation } from "react-i18next";

export function formatCost(cost) {
    if (cost == null || !Number.isFinite(cost)) return "—";
    if (cost <= 0) return "$0.00";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
}

export default function UsageCost({
    details,
    value = details.cost,
    per30Days = false,
}) {
    const { t } = useTranslation();
    return (
        <span className="inline-flex max-w-full flex-wrap items-baseline justify-end gap-x-1.5">
            <bdi>
                {formatCost(value)}
                {per30Days && value != null ? " / 30d" : ""}
            </bdi>
            {!details.complete && (
                <span
                    className="text-xs font-normal text-amber-800 dark:text-amber-200"
                    title={t("usageDashboard.missingCostDetails", {
                        count: details.unpricedRequests,
                        models: details.unpricedModels.join(", "),
                    })}
                >
                    {t(
                        value == null
                            ? "usageDashboard.unavailableCost"
                            : "usageDashboard.partialCost",
                    )}
                </span>
            )}
        </span>
    );
}
