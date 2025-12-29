/**
 * Shared markdown components configuration for workspace components.
 * This configuration provides consistent styling and security attributes
 * for markdown rendering across PromptList and WorkspaceInput components.
 */
export const workspaceMarkdownComponents = {
    p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
    h1: ({ node, ...props }) => (
        <h1 className="text-sm font-bold mb-2 mt-2 first:mt-0" {...props} />
    ),
    h2: ({ node, ...props }) => (
        <h2 className="text-xs font-bold mb-1 mt-2 first:mt-0" {...props} />
    ),
    h3: ({ node, ...props }) => (
        <h3 className="text-xs font-semibold mb-1 mt-1 first:mt-0" {...props} />
    ),
    ul: ({ node, ...props }) => (
        <ul className="list-disc list-inside mb-2 space-y-0.5" {...props} />
    ),
    ol: ({ node, ...props }) => (
        <ol className="list-decimal list-inside mb-2 space-y-0.5" {...props} />
    ),
    li: ({ node, ...props }) => <li className="text-xs" {...props} />,
    code: ({ node, inline, ...props }) =>
        inline ? (
            <code
                className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono"
                {...props}
            />
        ) : (
            <code
                className="block bg-gray-200 dark:bg-gray-700 p-2 rounded text-xs font-mono overflow-x-auto"
                {...props}
            />
        ),
    pre: ({ node, ...props }) => (
        <pre
            className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-xs font-mono overflow-x-auto mb-2"
            {...props}
        />
    ),
    a: ({ node, href, children, ...props }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
            {...props}
        >
            {children}
        </a>
    ),
    blockquote: ({ node, ...props }) => (
        <blockquote
            className="border-l-4 border-gray-300 dark:border-gray-600 pl-2 italic mb-2"
            {...props}
        />
    ),
};
