import React, { useState, useEffect } from "react";
import { AiOutlineTag } from "react-icons/ai";
import { Form } from "react-bootstrap";
import LoadingButton from "../editor/LoadingButton";
import { useLazyQuery } from "@apollo/client";
import { QUERIES } from "../../graphql";
import CopyButton from "../CopyButton";
import { useTranslation } from "react-i18next";
import config from "../../../config";

function TaxonomySelector({ text }) {
    const [resultCategories, setResultCategories] = useState([]);
    const [resultTopics, setResultTopics] = useState([]);
    const [resultTags, setResultTags] = useState([]);
    const [resultHashtags, setResultHashtags] = useState([]);
    const [selectedSet, setSelectedSet] = useState("");
    const { t } = useTranslation();

    const [
        fetchCategories,
        {
            loading: loadingCategories,
            error: errorCategories,
            data: dataCategories,
        },
    ] = useLazyQuery(QUERIES.TOPICS);
    const [
        fetchTopics,
        { loading: loadingTopics, error: errorTopics, data: dataTopics },
    ] = useLazyQuery(QUERIES.TOPICS);
    const [
        fetchTags,
        { loading: loadingTags, error: errorTags, data: dataTags },
    ] = useLazyQuery(QUERIES.TAGS);
    const [
        fetchHashtags,
        { loading: loadingHashtags, error: errorHashtags, data: dataHashtags },
    ] = useLazyQuery(QUERIES.HASHTAGS);
    const isSelectingTaxonomy =
        loadingCategories || loadingTopics || loadingTags || loadingHashtags;
    const [taxonomySets, setTaxonomySets] = useState([]);

    useEffect(() => {
        config?.data?.getTaxonomySets().then((sets) => {
            setTaxonomySets(sets.sort((a, b) => a.name.localeCompare(b.name)));
        });
    }, []);

    const handleSelect = () => {
        const selectedSetData = taxonomySets.find(
            (set) => set.setName === selectedSet,
        );

        fetchCategories({
            variables: {
                text,
                topics: selectedSetData.categories
                    ?.map((category) => category.replace(",", ":"))
                    .join(","),
                count: 1,
            },
            queryDeduplication: false,
            fetchPolicy: "network-only",
        });

        fetchTopics({
            variables: {
                text,
                topics: selectedSetData.topics
                    ?.map((topic) => topic.replace(",", ":"))
                    .join(","),
                count: null,
            },
            queryDeduplication: false,
            fetchPolicy: "network-only",
        });

        fetchTags({
            variables: {
                text,
                tags: selectedSetData.tags
                    ?.map((tag) => tag.replace(",", ":"))
                    .join(","),
            },
            queryDeduplication: false,
            fetchPolicy: "network-only",
        });

        fetchHashtags({
            variables: {
                text,
            },
            fetchPolicy: "network-only",
        });
    };

    useEffect(() => {
        if (dataCategories) {
            setResultCategories(dataCategories.topics.result);
        }
        if (dataTopics) {
            setResultTopics(dataTopics.topics.result);
        }
        if (dataTags) {
            setResultTags(dataTags.tags.result);
        }
        if (dataHashtags) {
            setResultHashtags(dataHashtags.hashtags.result);
        }
    }, [dataCategories, dataTopics, dataTags, dataHashtags]);

    return (
        <div className="taxonomy-section mb-5">
            <div className="taxonomy-row align-items-center">
                <h5>{t("Property")}</h5>
                <Form.Select
                    size="sm"
                    value={selectedSet}
                    onChange={(e) => setSelectedSet(e.target.value)}
                >
                    <option value="">{t("Choose property")}</option>
                    {taxonomySets.map((set) => (
                        <option key={set.setName} value={set.setName}>
                            {set.name}
                        </option>
                    ))}
                </Form.Select>
                <LoadingButton
                    disabled={!selectedSet}
                    loading={isSelectingTaxonomy}
                    text={t("Selecting")}
                    style={{ whiteSpace: "nowrap" }}
                    onClick={() => handleSelect()}
                >
                    <AiOutlineTag /> {t("Select")}
                </LoadingButton>
            </div>

            <div className="taxonomy-row">
                <div className="taxonomy-results-container">
                    <h5>{t("Hashtags")}</h5>
                    <div style={{ position: "relative" }}>
                        <Form.Control
                            as="textarea"
                            rows={2}
                            value={
                                resultHashtags.join(" ") ||
                                errorHashtags?.message ||
                                t("No hashtags selected")
                            }
                            readOnly
                        />
                        <CopyButton
                            text={resultHashtags.join(" ")}
                            variant={"opaque"}
                            style={{
                                position: "absolute",
                                top: "5px",
                                right: "5px",
                            }}
                        />
                    </div>
                </div>
            </div>

            {taxonomySets.find((t) => t.setName === selectedSet)?.categories
                ?.length > 0 && (
                <div className="taxonomy-row">
                    <div className="taxonomy-results-container">
                        <h5>{t("Categories")}</h5>
                        <div style={{ position: "relative" }}>
                            <Form.Control
                                as="textarea"
                                rows={2}
                                value={
                                    resultCategories.join(", ") ||
                                    errorCategories?.message ||
                                    t("No categories selected")
                                }
                                readOnly
                            />
                            <CopyButton
                                text={resultCategories.join(", ")}
                                variant={"opaque"}
                                style={{
                                    position: "absolute",
                                    top: "5px",
                                    right: "5px",
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
            <div className="taxonomy-row">
                <div className="taxonomy-results-container">
                    <h5>{t("Topics")}</h5>
                    <div style={{ position: "relative" }}>
                        <Form.Control
                            as="textarea"
                            rows={2}
                            value={
                                resultTopics.join(", ") ||
                                errorTopics?.message ||
                                t("No topics selected")
                            }
                            readOnly
                        />
                        <CopyButton
                            text={resultTopics.join(", ")}
                            variant={"opaque"}
                            style={{
                                position: "absolute",
                                top: "5px",
                                right: "5px",
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* If selectedSet has tags, render tags */}
            {taxonomySets.find((t) => t.setName === selectedSet)?.tags?.length >
                0 && (
                <div className="taxonomy-row">
                    <div className="taxonomy-results-container">
                        <h5>{t("Tags")}</h5>
                        <div style={{ position: "relative" }}>
                            <Form.Control
                                as="textarea"
                                rows={2}
                                value={
                                    resultTags.join(", ") ||
                                    errorTags?.message ||
                                    t("No tags selected")
                                }
                                readOnly
                            />
                            <CopyButton
                                text={resultTags.join(", ")}
                                variant={"opaque"}
                                style={{
                                    position: "absolute",
                                    top: "5px",
                                    right: "5px",
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TaxonomySelector;
