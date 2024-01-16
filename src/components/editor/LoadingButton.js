import Loader from "../../../app/components/loader";
import classNames from "../../../app/utils/class-names";

export default function LoadingButton({
    loading,
    disabled,
    onClick,
    style,
    children,
    className,
    type,
    text = "",
}) {
    return (
        <button
            className={classNames(
                "lb-primary text-center",
                className,
                loading ? "pe-5" : "",
            )}
            type={type}
            style={style}
            onClick={onClick}
            disabled={disabled || loading}
        >
            {loading && <Loader size="small" />}
            {loading ? <>&nbsp;{text}</> : <>{children}</>}
        </button>
    );
}
