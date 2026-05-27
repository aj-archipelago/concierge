/**
 * Icon components for MCP connector providers using inline SVGs.
 */
import { useContext } from "react";
import { Plug } from "lucide-react";
import { ThemeContext } from "../../contexts/ThemeProvider";

export function JiraIcon({ className = "w-4 h-4" }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005Z"
                fill="#2684FF"
            />
            <path
                d="M17.11 5.986H5.539a5.218 5.218 0 0 0 5.233 5.214h2.129v2.058a5.218 5.218 0 0 0 5.233 5.214V6.99a1.005 1.005 0 0 0-1.024-1.005Z"
                fill="#2684FF"
                opacity="0.86"
            />
            <path
                d="M22.648.46H11.077a5.218 5.218 0 0 0 5.233 5.214h2.13v2.058A5.218 5.218 0 0 0 23.672 12.946V1.465A1.005 1.005 0 0 0 22.648.46Z"
                fill="#2684FF"
                opacity="0.72"
            />
        </svg>
    );
}

export function SlackIcon({ className = "w-4 h-4" }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52ZM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313Z"
                fill="#E01E5A"
            />
            <path
                d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834ZM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312Z"
                fill="#36C5F0"
            />
            <path
                d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834ZM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312Z"
                fill="#2EB67D"
            />
            <path
                d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52ZM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313Z"
                fill="#ECB22E"
            />
        </svg>
    );
}

export function GitHubIcon({ className = "w-4 h-4" }) {
    const { theme } = useContext(ThemeContext);
    const fill = theme === "dark" ? "#ffffff" : "#24292f";
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill={fill}
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12Z" />
        </svg>
    );
}

const CONNECTOR_ICONS = {
    jira: JiraIcon,
    atlassian: JiraIcon,
    slack: SlackIcon,
    github: GitHubIcon,
};

/**
 * Returns the appropriate icon component for a connector.
 * Falls back to lucide-react Plug icon for unknown connectors.
 */
export function getConnectorIcon(iconName) {
    return CONNECTOR_ICONS[iconName] || Plug;
}
