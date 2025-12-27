"use client";

/**
 * Reusable empty state component for "no items" displays
 * @param {Object} props
 * @param {string} props.icon - Icon element or emoji to display
 * @param {string} props.title - Main title text
 * @param {string} props.description - Description text
 * @param {Function} props.action - Optional action button
 * @param {string} props.actionLabel - Label for action button
 * @param {React.ReactNode} props.children - Optional children for custom content
 */
export default function EmptyState({
    icon,
    title,
    description,
    action,
    actionLabel,
    children,
}) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-gray-400 mb-4">
                {typeof icon === "string" ? (
                    <div className="text-6xl">{icon}</div>
                ) : (
                    icon
                )}
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                {title}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md">
                {description}
            </p>
            {action && actionLabel && (
                <button className="lb-primary" onClick={action}>
                    {actionLabel}
                </button>
            )}
            {children}
        </div>
    );
}
