import { useQuery } from "@apollo/client";
import { Spinner } from "@/components/ui/spinner";
import { QUERIES } from "@/src/graphql";
import i18n from "@/src/i18n";

export default function ReadabilitySuggestions({ text, onSelect }) {
    const { loading, error, data } = useQuery(QUERIES.PASS, {
        notifyOnNetworkStatusChange: true,
        variables: {
            text: `${text}\n\nList the readability issues in the above article, along with an example of each issue, in the format 'number. issue "example"':`,
        },
    });

    if (loading && !data) {
        return (
            <p className="flex items-center gap-2">
                <Spinner size="sm" /> {i18n.t("Loading")}
            </p>
        );
    }

    if (error) {
        return (
            <p>
                {i18n.t("Error")} {error}
            </p>
        );
    }

    const pass = data?.pass?.result;
    const readabilityMarkup = pass
        .split(/\d+\. ?/)
        .filter((n) => n.trim())
        .map((tags, i) => {
            const [issue, example] = tags.split('"').map((t) => t.trim());
            return (
                <li key={`readability-${i}`}>
                    <b>{issue}</b> <i>&quot;{example}&quot;</i>
                </li>
            );
        });

    return (
        <div>
            <ul>{readabilityMarkup}</ul>
        </div>
    );
}
