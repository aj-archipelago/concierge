export const normalizeTheme = (theme) =>
    theme === "light" || theme === "dark" ? theme : undefined;

// Runs in the document head before content can paint or React can hydrate.
// Read the server-validated cookie from the root; never interpolate cookie text.
export const THEME_INIT_SCRIPT = `(function () {
    var root = document.documentElement;
    var theme = root.getAttribute("data-color-mode");
    if (theme !== "light" && theme !== "dark") {
        theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-color-mode", theme);
    root.style.colorScheme = theme;
    root.style.backgroundColor = theme === "dark" ? "#030712" : "#f9fafb";
    root.style.setProperty("--prefers-color-scheme", theme);
})();`;

export function getInitialTheme(savedTheme) {
    return (
        normalizeTheme(savedTheme) ||
        (typeof document !== "undefined" &&
            normalizeTheme(
                document.documentElement.getAttribute("data-color-mode"),
            )) ||
        "light"
    );
}

export function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-color-mode", theme);
    root.style.colorScheme = theme;
    root.style.backgroundColor = theme === "dark" ? "#030712" : "#f9fafb";
    root.style.setProperty("--prefers-color-scheme", theme);
    // Keep the legacy SCSS selectors working alongside Tailwind's root class.
    document.body.classList.toggle("dark", theme === "dark");
}

export function saveThemeCookie(theme) {
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}
