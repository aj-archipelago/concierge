import { useQuery } from "@apollo/client";
import { useContext, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import stringcase from "stringcase";
import { DataContext } from "../../contexts/DataProvider";
import { QUERIES } from "../../../../src/graphql";
import { X } from "lucide-react";
import i18n from "../../../../src/i18n";

const TAXONOMIES = {
    TOPICS: "categories",
    TAGS: "tags",
    LOCATIONS: "where",
};

export default function TaxonomySuggestions({ text, onSelect }) {
    const [topics, setTopics] = useState([]);
    const [tags, setTags] = useState([]);
    const [where, setWhere] = useState([]);

    return (
        <div className="mb-3 d-flex gap-2">
            <div
                className="p-3 bg-gray-100 border rounded"
                style={{ width: "33%" }}
            >
                <SingleTaxonomySuggestions
                    query="TOPICS"
                    text={text}
                    onSelect={(topics) => {
                        onSelect({ topics, tags, where });
                        setTopics(topics);
                    }}
                />
            </div>

            <div
                className="p-3 bg-gray-100 border rounded"
                style={{ width: "33%" }}
            >
                <SingleTaxonomySuggestions
                    query="TAGS"
                    text={text}
                    onSelect={(tags) => {
                        onSelect({ topics, tags, where });
                        setTags(tags);
                    }}
                />
            </div>

            <div
                className="p-3 bg-gray-100 border rounded"
                style={{ width: "33%" }}
            >
                <SingleTaxonomySuggestions
                    query="LOCATIONS"
                    text={text}
                    onSelect={(where) => {
                        onSelect({ topics, tags, where });
                        setWhere(where);
                    }}
                />
            </div>
        </div>
    );
}

function SingleTaxonomySuggestions({ query, text, onSelect }) {
    const taxonomy = TAXONOMIES[query.toUpperCase()];
    const contextData = useContext(DataContext);

    const allItems = contextData?.[taxonomy].map((i) => i.name) || [];

    const { loading, error, data } = useQuery(QUERIES[query], {
        notifyOnNetworkStatusChange: true,
        fetchPolicy: "network-only",
        variables: { text, [query.toLowerCase()]: allItems.join(", ") },
    });

    const [itemFilter, setItemFilter] = useState("");
    const [selectableItems, setSelectableItems] = useState(allItems);
    const [selectedItems, setSelectedItems] = useState([]);

    useEffect(() => {
        if (data) {
            const newItems = data[query.toLowerCase()].result
                .map((r) => r.trim())
                .sort();
            setSelectedItems(newItems);
            onSelect(newItems);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    if (loading && !data) {
        return (
            <p className="flex items-center gap-2">
                <Spinner size="sm" /> {i18n.t("Loading")}
            </p>
        );
    }

    if (!contextData[taxonomy]) {
        return <p>{i18n.t("Loading")}</p>;
    }

    if (error) {
        return (
            <p>
                {i18n.t("Error")} {error.toString()}
            </p>
        );
    }

    return (
        <div>
            <h6>
                {i18n.t("Selected")} {stringcase.lowercase(query)}
            </h6>
            <div className="flex gap-2 flex-wrap max-h-20 overflow-y-auto mb-3">
                {selectedItems.map((item) => (
                    <Badge
                        key={`topic-${item}`}
                        variant="secondary"
                        className="taxonomy flex items-center gap-1"
                    >
                        {item}
                        <X
                            className="taxonomy-remove cursor-pointer"
                            size={16}
                            onClick={() => {
                                setSelectedItems(
                                    selectedItems.filter((t) => t !== item),
                                );
                                onSelect(
                                    selectedItems.filter((t) => t !== item),
                                );
                            }}
                        />
                    </Badge>
                ))}
            </div>
            <h6>
                {i18n.t("Add more")} {stringcase.lowercase(query)}
            </h6>
            <div className="mb-2">
                <Input
                    type="text"
                    placeholder="Filter"
                    value={itemFilter}
                    onChange={(e) => {
                        const itemFilter = e.target.value;
                        setItemFilter(itemFilter);

                        if (itemFilter) {
                            setSelectableItems(
                                allItems.filter((item) =>
                                    item
                                        .toLowerCase()
                                        .includes(itemFilter.toLowerCase()),
                                ),
                            );
                        } else {
                            setSelectableItems(allItems);
                        }
                    }}
                />
            </div>
            <div className="max-h-36 overflow-auto border rounded">
                {selectableItems.map((item) => (
                    <div
                        key={`topic-original-${item}`}
                        className="border-b last:border-b-0 p-2 hover:bg-gray-50"
                    >
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id={`topic-${item}-checkbox`}
                                checked={selectedItems.includes(item)}
                                onCheckedChange={(checked) => {
                                    if (checked) {
                                        if (!selectedItems.includes(item)) {
                                            const newItems = [
                                                ...selectedItems,
                                                item,
                                            ].sort();
                                            setSelectedItems(newItems);
                                            onSelect(newItems);
                                        }
                                    } else {
                                        const newItems = selectedItems.filter(
                                            (t) => t !== item,
                                        );
                                        setSelectedItems(newItems);
                                        onSelect(newItems);
                                    }
                                }}
                            />
                            <Label
                                htmlFor={`topic-${item}-checkbox`}
                                className="cursor-pointer"
                            >
                                {item}
                            </Label>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
