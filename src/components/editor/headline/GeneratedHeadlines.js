import { useEffect, useState } from "react";
import Subheads from "./Subheads";

export default function GeneratedHeadlines({
    loading,
    headlines,
    text,
    onSelect,
}) {
    const [selectedHeadline, setSelectedHeadline] = useState(null);

    useEffect(() => {
        setSelectedHeadline(null);
    }, [headlines]);

    if (loading) {
        return <p>Loading</p>;
    }

    if (headlines.length === 0 && !loading) {
        return <p>No headlines generated</p>;
    }

    if (selectedHeadline) {
        return (
            <div className="list-group">
                <SelectableListItem
                    loading={loading}
                    headline={selectedHeadline}
                    checked={true}
                    onSelect={(checked) => {
                        onSelect(null);
                        if (checked) {
                            setSelectedHeadline(selectedHeadline);
                        } else {
                            setSelectedHeadline(null);
                        }
                    }}
                />
                <div className="list-group-item">
                    <h6 className="font-bold mt-2 mb-0">Subheads</h6>
                    <p className="text-gray-600 text-sm">
                        <small>Max length: 120 characters</small>
                    </p>
                    <Subheads
                        headline={selectedHeadline}
                        text={text}
                        onSelect={(subhead) =>
                            onSelect({
                                headline: selectedHeadline,
                                subhead,
                            })
                        }
                    />
                </div>
            </div>
        );
    } else {
        return (
            <div className="list-group">
                {headlines.map((headline) => (
                    <SelectableListItem
                        loading={loading}
                        key={headline}
                        headline={headline}
                        checked={false}
                        onSelect={() => setSelectedHeadline(headline)}
                    />
                ))}
            </div>
        );
    }
}

function SelectableListItem({ loading, checked = false, onSelect, headline }) {
    return (
        <div
            className={`list-group-item ${loading ? "text-gray-400" : "pr-20"}`}
        >
            <div className="flex items-center gap-3 headline-display">
                <input
                    type="checkbox"
                    className="form-checkbox mt-1"
                    checked={checked}
                    onChange={(e) => onSelect(e.target.checked)}
                />
                <span>{headline}</span>
            </div>
        </div>
    );
}
