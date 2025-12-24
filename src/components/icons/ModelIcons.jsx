/**
 * Icon components for AI model providers using official SVG files
 */
import { useContext } from "react";
import { basePath } from "../../utils/constants";
import { ThemeContext } from "../../contexts/ThemeProvider";

export function OpenAIIcon({ className = "w-4 h-4" }) {
    const { theme } = useContext(ThemeContext);
    const iconFile = theme === "dark" ? "openai-dark.svg" : "openai-light.svg";
    return (
        <img
            src={`${basePath || ""}/assets/${iconFile}`}
            alt="OpenAI"
            className={className}
        />
    );
}

export function GoogleGeminiIcon({ className = "w-4 h-4" }) {
    return (
        <img
            src={`${basePath || ""}/assets/google-icon.svg`}
            alt="Google"
            className={className}
        />
    );
}

export function AnthropicIcon({ className = "w-4 h-4" }) {
    return (
        <img
            src={`${basePath || ""}/assets/claude-icon.svg`}
            alt="Anthropic"
            className={className}
        />
    );
}

export function XAIGrokIcon({ className = "w-4 h-4" }) {
    const { theme } = useContext(ThemeContext);
    const iconFile = theme === "dark" ? "grok-dark.svg" : "grok-light.svg";
    return (
        <img
            src={`${basePath || ""}/assets/${iconFile}`}
            alt="XAI"
            className={className}
        />
    );
}
