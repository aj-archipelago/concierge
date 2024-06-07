import { useQuery } from "@apollo/client";
import { useState } from "react";
import { QUERIES } from "../../../graphql";

export default function Subheads({ headline, text, onSelect }) {
    const query = "SUBHEAD";
    const [selectedSubhead, setSelectedSubhead] = useState(null);

    const variables = {
        text,
        headline,
        count: 3,
    };

    const { loading, error, data } = useQuery(QUERIES[query], {
        variables,
        notifyOnNetworkStatusChange: true,
        fetchPolicy: "network-only",
        skip: !text,
    });

    if (loading) {
        return (
            <p className="flex items-center">
                <span className="loader mr-2"></span> Loading subhead
                suggestions
            </p>
        );
    }

    if (error) {
        console.error("error", error);
        return (
            <p>
                Error loading subhead suggestions:{" "}
                {error.message || error.toString()}
            </p>
        );
    }

    const subheads = data?.[query.toLowerCase()]?.result || [];

    return subheads.map((subhead) => (
        <div key={subhead} className="flex items-center gap-3 mb-2">
            <input
                type="checkbox"
                className="form-checkbox"
                value={subhead}
                checked={selectedSubhead === subhead}
                onChange={(e) => {
                    if (e.target.checked) {
                        onSelect(subhead);
                        setSelectedSubhead(subhead);
                    }
                }}
            />
            <span>{subhead}</span>
        </div>
    ));
}
