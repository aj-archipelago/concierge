import { useApolloClient, useQuery } from "@apollo/client";
import { useEffect, useState } from "react";
import Select from "react-select";
import { QUERIES } from "../../../graphql";
import LoadingButton from "../LoadingButton";
import GeneratedHeadlines from "./GeneratedHeadlines";
import StoryAngles from "./StoryAngles";

function HeadlineModal({ text, onSelect, args }) {
    const query = "HEADLINE_CUSTOM";
    const [workingIdea, setWorkingIdea] = useState("");
    const [workingStyle, setWorkingStyle] = useState("default");
    const [includedKeywords, setIncludedKeywords] = useState([]);
    const [availableKeywords, setAvailableKeywords] = useState([]);
    const [parameters, setParameters] = useState({});
    const client = useApolloClient();

    const targetLength = 65;

    useEffect(() => {
        client
            .query({
                query: QUERIES.ENTITIES,
                variables: { text, count: 20 },
                fetchPolicy: "network-only",
            })
            .then(({ data }) => {
                const result = data.entities.result.map((e) => e.name.trim());
                // deduplicate
                const unique = [...new Set(result)];
                setAvailableKeywords(unique);
            });
    }, [client, text]);

    const variables = Object.assign(
        {},
        {
            text,
            idea: parameters.idea,
            style: parameters.style,
            keywords: parameters.keywords,
            targetLength,
            count: 3,
        },
        args,
    );

    const { loading, error, data, refetch } = useQuery(QUERIES[query], {
        variables,
        notifyOnNetworkStatusChange: true,
        fetchPolicy: "network-only",
        skip: !text,
    });

    const headlines = data?.[query.toLowerCase()]?.result || [];

    return (
        <div className="pt-2">
            <div className="relative">
                <div className="flex gap-6">
                    <div className="flex-1">
                        <div className="mb-4 bg-gray-50 rounded-md border p-2">
                            <label className="flex items-center mb-2 text-sm font-medium">
                                <input
                                    type="checkbox"
                                    className="me-2"
                                    checked={workingIdea}
                                    onChange={(e) => {
                                        e.target.checked
                                            ? setWorkingIdea(workingIdea)
                                            : setWorkingIdea("");
                                    }}
                                />
                                Emphasize a particular angle
                            </label>
                            <input
                                type="text"
                                className="lb-input w-full mb-2"
                                placeholder="Type an angle or select one below"
                                value={workingIdea}
                                onChange={(e) => setWorkingIdea(e.target.value)}
                            />
                            <StoryAngles
                                text={text}
                                onSelect={(t) => setWorkingIdea(t)}
                                currentAngle={workingIdea}
                            />
                        </div>

                        <div className="bg-gray-50 rounded-md border p-2">
                            <div>
                                <label className="flex items-center mb-2 text-sm font-medium">
                                    <input
                                        type="checkbox"
                                        className="me-2"
                                        checked={includedKeywords.length > 0}
                                        onChange={(e) => {
                                            e.target.checked
                                                ? setIncludedKeywords(
                                                      availableKeywords,
                                                  )
                                                : setIncludedKeywords([]);
                                        }}
                                    />
                                    Include specific keywords
                                </label>
                            </div>
                            {!availableKeywords.length && (
                                <p>Loading keywords...</p>
                            )}
                            <div className="flex flex-wrap">
                                <Select
                                    classNamePrefix="react-select"
                                    className="w-full react-select"
                                    isMulti
                                    options={availableKeywords.map((k) => ({
                                        value: k,
                                        label: k,
                                    }))}
                                    value={includedKeywords.map((k) => ({
                                        value: k,
                                        label: k,
                                    }))}
                                    onChange={(selected) => {
                                        setIncludedKeywords(
                                            selected.map((s) => s.value),
                                        );
                                    }}
                                />
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-md border p-2 mt-4 text-sm">
                            <label className="flex items-center mb-2">
                                <input
                                    type="checkbox"
                                    className="me-2"
                                    checked={workingStyle === "quote"}
                                    onChange={(e) =>
                                        e.target.checked
                                            ? setWorkingStyle("quote")
                                            : setWorkingStyle("default")
                                    }
                                />
                                Include a quote from the article in the headline
                                (e.g. "So trapped": A young Iraqi driver's
                                costly taxi to nowhere)
                            </label>
                        </div>
                    </div>
                    <div className="flex-1">
                        <LoadingButton
                            className="btn-primary mb-2.5"
                            onClick={() => {
                                if (
                                    parameters.idea !== workingIdea ||
                                    parameters.style !== workingStyle ||
                                    parameters.keywords !== includedKeywords
                                ) {
                                    setParameters({
                                        idea: workingIdea,
                                        style: workingStyle,
                                        keywords: includedKeywords,
                                    });
                                } else {
                                    refetch();
                                }
                            }}
                            loading={loading}
                            text="Generating"
                        >
                            Generate Headlines
                        </LoadingButton>
                        <h6 className="font-bold mb-0">Headlines</h6>
                        <p className="text-gray-600 text-sm">
                            <small>Max length: {targetLength} characters</small>
                        </p>
                        {error && (
                            <p className="text-red-500">
                                Error: {error.message}
                            </p>
                        )}
                        {!error && (
                            <GeneratedHeadlines
                                headlines={headlines}
                                loading={loading}
                                text={text}
                                onSelect={onSelect}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default HeadlineModal;
