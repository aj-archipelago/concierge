import classNames from "../../../app/utils/class-names";

const STYLES = {
    completed:
        "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    pending:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
    in_progress: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
    abandoned:
        "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
};

export default function StatusBadge({ status }) {
    return (
        <span
            className={classNames(
                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                STYLES[status] || STYLES.cancelled,
            )}
        >
            {status}
        </span>
    );
}
