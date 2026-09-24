export default function CountBadge({ children, pulse = false }) {
    return (
        <span
            data-count-badge
            className="absolute -top-1 -end-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs leading-none text-white"
        >
            {pulse && (
                <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-red-500 opacity-75 motion-safe:animate-ping"
                />
            )}
            <span className="relative whitespace-nowrap" dir="ltr">
                {children}
            </span>
        </span>
    );
}
