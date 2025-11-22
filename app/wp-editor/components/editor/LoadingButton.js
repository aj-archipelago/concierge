import Button from "./button/index";
import { LoadingSVG } from "./Assets";
import { clsx } from "clsx";
import i18n from "@/src/i18n";

/**
 * Loading Button Component.
 *
 * @param {boolean} loading    Whether the button is in a loading state.
 * @param {boolean} disabled   Whether the button is disabled.
 * @param {string} loadingText The text to display when the button is in a loading state.
 * @param {function} onClick   Function to run when the button is clicked.
 * @param {string} className   Additional classes to add to the button.
 * @param {string} children    The text to display in the button.
 */
export default function LoadingButton({
    loading,
    disabled,
    loadingText = i18n.t("Loading"),
    onClick,
    className = "",
    children,
}) {
    const buttonClasses = clsx("modal-loading-button", {
        "is-loading": loading,
    });
    return (
        <Button
            className={`${buttonClasses} ${className}`}
            onClick={onClick}
            disabled={disabled || loading}
        >
            {loading && <LoadingSVG />}
            {loading ? <>&nbsp;{loadingText}</> : <>{children}</>}
        </Button>
    );
}
