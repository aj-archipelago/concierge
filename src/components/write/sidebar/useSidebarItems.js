import { useState, useEffect, useContext } from "react";
import {
    FileText,
    List,
    FileText as Summarize,
    Search,
    Clock,
    Tag,
    X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { QUERIES } from "../../../graphql";
import CopyButton from "../../CopyButton";
import LoadingButton from "../../editor/LoadingButton";
import Timeline from "../Timeline";
import SidebarItemDialog from "./SidebarItemDialog";
import config from "../../../../config";
import { LanguageContext } from "../../../contexts/LanguageProvider";

const SummaryOptions = ({
    value,
    loading,
    onChange,
    onCommit,
    handleClearSummary,
}) => {
    const { t } = useTranslation();

    return (
        <div className="flex items-center gap-2.5 text-xs mb-3">
            <div>{t("Length")}</div>
            <input
                className="flex-shrink-0 w-20 h-6 text-xs p-1 min-w-[50px] lb-input rounded"
                key="summary-length"
                type="number"
                value={value.targetLength}
                onChange={(e) =>
                    onChange({ targetLength: parseInt(e.target.value) })
                }
            />
            <LoadingButton
                loading={loading}
                disabled={loading}
                className="w-8 h-6 text-xs lb-primary"
                onClick={() => {
                    handleClearSummary();
                    onCommit();
                }}
            >
                {t("Go")}
            </LoadingButton>
        </div>
    );
};

export function useSidebarItems(inputText, onAction) {
    const { language } = useContext(LanguageContext);
    const [openDialog, setOpenDialog] = useState(null);

    // State for each sidebar item
    const [summary, setSummary] = useState("");
    const [highlights, setHighlights] = useState([]);
    const [keywords, setKeywords] = useState([]);
    const [topics, setTopics] = useState([]);
    const [tags, setTags] = useState([]);
    const [entities, setEntities] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [potentialTags, setPotentialTags] = useState([]);
    const [potentialTopics, setPotentialTopics] = useState([]);

    // Load potential tags and topics
    useEffect(() => {
        if (config?.data?.getTags && config?.data?.getTopics) {
            setTimeout(() => {
                config.data.getTags(language).then((tags) => {
                    setPotentialTags(tags || []);
                });
                config.data.getTopics(language).then((topics) => {
                    setPotentialTopics(topics || []);
                });
            }, 1);
        }
    }, [language]);

    const sidebarItems = [
        {
            key: "summary",
            name: "Summary",
            icon: <Summarize className="w-4 h-4" />,
            output: summary,
            query: {
                query: QUERIES.SUMMARIZE_TURBO,
                variables: { text: inputText },
            },
            onGenerate: (data) => setSummary(data?.summarize_turbo?.result),
            defaultParameters: { targetLength: 120 },
            Options: (props) => (
                <SummaryOptions
                    {...props}
                    handleClearSummary={() => setSummary("")}
                />
            ),
            renderOutput: () => (
                <div>
                    <pre className="font-sans text-sm whitespace-pre-wrap">
                        {summary}
                    </pre>
                </div>
            ),
        },
        {
            key: "highlights",
            name: "Highlights",
            icon: <FileText className="w-4 h-4" />,
            output: highlights,
            query: {
                query: QUERIES.HIGHLIGHTS,
                variables: { text: inputText },
            },
            onGenerate: (data) => {
                try {
                    setHighlights(
                        data?.highlights?.result
                            ?.split("\n\n")
                            .map((v) => JSON.parse(v))
                            .flat(),
                    );
                } catch (e) {
                    console.error(e);
                    setHighlights([]);
                }
            },
            renderOutput: () => (
                <div className="mb-2">
                    {highlights.map((item, i) => (
                        <div
                            key={`highlight-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <div className="flex justify-between">
                                <div className="flex-1">{item}</div>
                                <div>
                                    <button
                                        className="p-0 text-gray-500 hover:text-gray-700"
                                        onClick={() => {
                                            onAction("remove_content", {
                                                content: item,
                                            });
                                        }}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ),
        },
        {
            key: "search-keywords",
            name: "Search keywords",
            icon: <Search className="w-4 h-4" />,
            output: keywords,
            query: {
                query: QUERIES.KEYWORDS,
                variables: { text: inputText },
            },
            onGenerate: (data) => setKeywords(data?.keywords?.result || []),
            renderOutput: () => (
                <div className="mb-2">
                    {keywords.map((item, i) => (
                        <div
                            key={`keyword-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <CopyButton item={item} />
                            {item}
                        </div>
                    ))}
                </div>
            ),
        },
        {
            key: "topics",
            name: "Topics",
            icon: <Tag className="w-4 h-4" />,
            output: topics,
            query: {
                query: QUERIES.TOPICS,
                variables: {
                    text: inputText,
                    topics: potentialTopics?.join(", "),
                },
            },
            onGenerate: (data) => setTopics(data?.topics?.result || []),
            renderOutput: () => (
                <div className="mb-2">
                    {topics.map((item, i) => (
                        <div
                            key={`topic-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <CopyButton item={item} />
                            {item}
                        </div>
                    ))}
                </div>
            ),
        },
        {
            key: "tags",
            name: "Tags",
            icon: <Tag className="w-4 h-4" />,
            output: tags,
            query: {
                query: QUERIES.TAGS,
                variables: {
                    text: inputText,
                    tags: potentialTags?.join(", "),
                },
            },
            onGenerate: (data) => setTags(data?.tags?.result || []),
            renderOutput: () => (
                <div className="mb-2">
                    {tags.map((item, i) => (
                        <div
                            key={`tag-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <CopyButton item={item} />
                            {item}
                        </div>
                    ))}
                </div>
            ),
        },
        {
            key: "entities",
            name: "Entities",
            icon: <List className="w-4 h-4" />,
            output: entities,
            query: {
                query: QUERIES.ENTITIES,
                variables: { text: inputText },
            },
            onGenerate: (data) => setEntities(data?.entities?.result || []),
            renderOutput: () => (
                <div className="mb-2">
                    {entities.map((entity, i) => (
                        <div
                            key={`entity-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <CopyButton
                                item={`${entity.name}: ${entity.definition}`}
                            />
                            <strong>{entity.name}</strong>
                            <br />
                            {entity.definition}
                        </div>
                    ))}
                </div>
            ),
        },
        {
            key: "timeline",
            name: "Timeline",
            icon: <Clock className="w-4 h-4" />,
            output: timeline,
            query: {
                query: QUERIES.TIMELINE,
                variables: { text: inputText },
            },
            onGenerate: (data) => {
                try {
                    setTimeline(
                        data?.timeline?.result
                            ?.split("\n\n")
                            .map((k) => {
                                try {
                                    return JSON.parse(k);
                                } catch (e) {
                                    console.error(e, k);
                                    return [];
                                }
                            })
                            .flat(),
                    );
                } catch (e) {
                    console.error(e);
                    setTimeline([]);
                }
            },
            renderOutput: () => <Timeline timeline={timeline} />,
        },
    ];

    const openDialogForItem = (key) => {
        setOpenDialog(key);
    };

    const closeDialog = () => {
        setOpenDialog(null);
    };

    const dialogs = sidebarItems.map((item) => (
        <SidebarItemDialog
            key={item.key}
            show={openDialog === item.key}
            onHide={closeDialog}
            inputText={inputText}
            name={item.name}
            icon={item.icon}
            output={item.output}
            query={item.query}
            Options={item.Options}
            onGenerate={item.onGenerate}
            defaultParameters={item.defaultParameters}
            renderOutput={item.renderOutput}
        />
    ));

    return {
        sidebarItems,
        openDialogForItem,
        dialogs,
    };
}
