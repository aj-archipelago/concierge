import Loader from "../../../app/components/loader";
import classNames from "../../../app/utils/class-names";

export default function LoadingButton({
    loading,
    disabled,
    onClick,
    style,
    children,
    className = "lb-primary",
    type,
    text = "",
}) {
    return (
        <button
            className={classNames(
                "flex gap-2 items-center justify-center",
                className,
                loading ? "pe-[1.5rem]" : "",
            )}
            type={type}
            style={style}
            onClick={onClick}
            disabled={disabled || loading}
        >
            {loading && <Loader size="small" className="text-white" />}
            {loading ? <>&nbsp;{text}</> : <>{children}</>}
        </button>
    );
}
