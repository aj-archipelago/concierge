import { useApolloClient, useQuery } from "@apollo/client";
import { useEffect, useState } from "react";
import { Form } from "react-bootstrap";
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
                //deduplicate
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
        <div className="p-2">
            <div style={{ position: "relative" }}>
                <div className="d-flex gap-3">
                    <div style={{ flexBasis: "40%" }}>
                        <Form.Check
                            type="checkbox"
                            label={`Emphasize a particular angle`}
                            style={{ marginBottom: 10 }}
                            checked={workingIdea}
                            onChange={(e) => {
                                e.target.checked
                                    ? setWorkingIdea(workingIdea)
                                    : setWorkingIdea("");
                            }}
                        />
                        <Form.Control
                            type="text"
                            placeholder="Type an angle or select one below"
                            value={workingIdea}
                            onChange={(e) => setWorkingIdea(e.target.value)}
                        />
                        <StoryAngles
                            text={text}
                            onSelect={(t) => setWorkingIdea(t)}
                            currentAngle={workingIdea}
                        />

                        <div style={{ marginTop: "2em" }}>
                            <div>
                                <Form.Check
                                    type="checkbox"
                                    label={`Include specific keywords`}
                                    style={{ marginBottom: 10 }}
                                    checked={includedKeywords.length > 0}
                                    onChange={(e) => {
                                        e.target.checked
                                            ? setIncludedKeywords(
                                                  availableKeywords,
                                              )
                                            : setIncludedKeywords([]);
                                    }}
                                />
                            </div>
                        </div>
                        {/* Checkboxes for all available keywords to include in includedkeywords */}
                        {!availableKeywords.length && (
                            <p>Loading keywords...</p>
                        )}
                        <div className="d-flex" style={{ flexWrap: "wrap" }}>
                            <Select
                                classNamePrefix="react-select"
                                className="w-100 react-select"
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

                        <div style={{ marginTop: "2em" }}>
                            <div>
                                <Form.Check
                                    type="checkbox"
                                    label={`Include a quote from the article in the headline (e.g. "So trapped": A young Iraqi driver's costly taxi to nowhere)`}
                                    style={{ marginBottom: 10 }}
                                    checked={workingStyle === "quote"}
                                    onChange={(e) =>
                                        e.target.checked
                                            ? setWorkingStyle("quote")
                                            : setWorkingStyle("default")
                                    }
                                />
                            </div>
                        </div>
                    </div>
                    <div style={{ flexBasis: "60%" }}>
                        <LoadingButton
                            className={"lb-primary mb-2.5"}
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
                        <h6 className="fw-bold mb-0">Headlines</h6>
                        <p className="text-muted">
                            <small>Max length: {targetLength} characters</small>
                        </p>
                        {error && (
                            <p className="text-danger">
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
