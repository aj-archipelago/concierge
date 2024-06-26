export default function Loader({ size = "default" }) {
    let heightClass = "h-4";
    let widthClass = "w-4";

    if (size === "small") {
        heightClass = "h-3";
        widthClass = "w-3";
    }

    return (
        <div
            className={`inline-block ${heightClass} ${widthClass} animate-[spinner-grow_0.75s_linear_infinite] rounded-full bg-current align-[-0.125em] opacity-0 motion-reduce:animate-[spinner-grow_1.5s_linear_infinite]`}
            role="status"
        >
            <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
                Loading...
            </span>
        </div>
    );
}
