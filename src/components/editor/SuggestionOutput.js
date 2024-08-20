const SuggestionOutput = ({ outputType, value, onChange }) => {
    if (outputType === "readonly") {
        return <p>{value}</p>;
    }

    if (outputType === "editable") {
        return (
            <textarea
                dir="auto"
                rows={10}
                className="form-textarea"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        );
    }

    if (outputType === "list") {
        return (
            <div
                onChange={(e) => onChange(e.target.labels[0].innerText)}
                className="bg-white mb-3"
            >
                {value.slice(0, Math.min(5, value.length)).map((label, i) => (
                    <div key={`output-list-${i}`} className="mb-3">
                        <label>
                            <input
                                type="radio"
                                name={`output-list-radio`}
                                id={`output-list-${i}`}
                                className="mr-2"
                            />
                            {label.replace(/^"+|[".]+$/g, "")}
                        </label>
                    </div>
                ))}
            </div>
        );
    }

    return null;
};

export default SuggestionOutput;
