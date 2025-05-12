import { useLazyQuery } from "@apollo/client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AiOutlineTag } from "react-icons/ai";
import config from "../../../config";
import { QUERIES } from "../../graphql";
import CopyButton from "../CopyButton";
import LoadingButton from "../editor/LoadingButton";

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
    const [error, setError] = useState(null);

    useEffect(() => {
        config?.data
            ?.getTaxonomySets()
            .then((sets) => {
                setTaxonomySets(
                    sets?.sort((a, b) => a.name.localeCompare(b.name)) || [],
                );
            })
            .catch((e) => {
                setError(e);
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

    if (error) {
        return <div className="text-red-500">{t(error.message)}</div>;
    }

    return (
        <div className="mb-5">
            <div className="flex items-center space-x-4">
                <h5 className="font-medium">{t("Property")}</h5>
                <select
                    className="lb-select w-48"
                    value={selectedSet}
                    onChange={(e) => setSelectedSet(e.target.value)}
                >
                    <option value="">{t("Choose property")}</option>
                    {taxonomySets.map((set) => (
                        <option key={set.setName} value={set.setName}>
                            {set.name}
                        </option>
                    ))}
                </select>
                <LoadingButton
                    disabled={!selectedSet}
                    loading={isSelectingTaxonomy}
                    text={t("Selecting")}
                    className="lb-primary"
                    onClick={() => handleSelect()}
                >
                    <AiOutlineTag /> {t("Select")}
                </LoadingButton>
            </div>

            <div className="taxonomy-row mt-4">
                <div className="taxonomy-results-container">
                    <h5 className="font-medium">{t("Hashtags")}</h5>
                    <div className="relative">
                        <textarea
                            className="lb-input"
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
                            className="absolute top-1 right-1"
                        />
                    </div>
                </div>
            </div>

            {taxonomySets.find((t) => t.setName === selectedSet)?.categories
                ?.length > 0 && (
                <div className="taxonomy-row mt-4">
                    <div className="taxonomy-results-container">
                        <h5 className="font-medium">{t("Categories")}</h5>
                        <div className="relative">
                            <textarea
                                className="lb-input"
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
                                className="absolute top-1 right-1"
                            />
                        </div>
                    </div>
                </div>
            )}
            <div className="taxonomy-row mt-4">
                <div className="taxonomy-results-container">
                    <h5 className="font-medium">{t("Topics")}</h5>
                    <div className="relative">
                        <textarea
                            className="lb-input"
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
                            className="absolute top-1 right-1"
                        />
                    </div>
                </div>
            </div>

            {taxonomySets.find((t) => t.setName === selectedSet)?.tags?.length >
                0 && (
                <div className="taxonomy-row mt-4">
                    <div className="taxonomy-results-container">
                        <h5>{t("Tags")}</h5>
                        <div className="relative">
                            <textarea
                                className="lb-input"
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
                                className="absolute top-1 right-1"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TaxonomySelector;
