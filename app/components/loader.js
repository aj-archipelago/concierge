export default function Loader({ size = "default" }) {
    let heightClass = "h-4";
    let widthClass = "w-4";

    if (size === "small") {
        heightClass = "h-3";
        widthClass = "w-3";
    }

    return (
        <div className="relative inline-flex">
            <div
                className={`${heightClass} ${widthClass} bg-sky-500 rounded-full`}
            ></div>
            <div
                className={`${heightClass} ${widthClass} bg-sky-500 rounded-full absolute top-0 left-0 animate-ping`}
            ></div>
            <div
                className={`${heightClass} ${widthClass} bg-sky-500 rounded-full absolute top-0 left-0 animate-pulse`}
            ></div>
        </div>
    );
}
