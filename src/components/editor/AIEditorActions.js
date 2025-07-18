import { useTranslation } from "react-i18next";
import {
    FileText,
    Expand,
    BookOpen,
    Edit,
    Languages,
    CheckCircle,
    List,
    FileText as Summarize,
    Tag,
} from "lucide-react";
import config from "../../../config";
import CopyButton from "../CopyButton";
import ExpandStoryContent from "./ExpandStoryContent";
import SuggestionInput from "./SuggestionInput";
import { getTextSuggestionsComponent } from "./TextSuggestions";
import TranslateModalContent from "./TranslateModalContent";
import HeadlineModal from "./headline/HeadlineModal";

const ListRenderer = ({ value }) => {
    value.sort();

    return (
        <ul style={{ marginBottom: 20 }} className="border rounded-md p-2">
            {value.map((item, index) => (
                <li key={index}>
                    <CopyButton item={item} />
                    {item}
                </li>
            ))}
        </ul>
    );
};

const customActions = config.write?.actions || {};

const actions = {
    grammar: {
        Icon: CheckCircle,
        title: "Spelling and grammar",
        dialogClassName: "modal-wide",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "GRAMMAR",
            outputType: "diff",
        }),
        commitLabel: "Use Corrected Version",
    },
    headline: {
        Icon: FileText,
        title: "Headline creator",
        dialogClassName: "modal-wide",
        SuggestionsComponent: HeadlineModal,
        commitLabel: "Use selected headline and subhead",
    },
    styleguide: {
        Icon: BookOpen,
        title: "Apply style guide",
        dialogClassName: "modal-wide",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "STYLE_GUIDE",
            outputType: "diff-styleguide",
            outputTitle: "",
        }),
        commitLabel: "Use Corrected Text",
    },
    summarize: {
        Icon: Summarize,
        title: "Summarize",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "SUMMARIZE_TURBO",
            outputTitle: "Summary",
            redoText: "Write another summary",
            showLoadingMessage: true,
            SuggestionInput: SuggestionInput,
            QueryParameters: ({ value, onChange }) => {
                const { t } = useTranslation();
                value.targetLength = value.targetLength || 500;

                function getTargetLength(event) {
                    const returnValue = parseInt(event.target.value, 10);
                    if (
                        isNaN(returnValue) ||
                        returnValue < 0 ||
                        returnValue > 9999
                    ) {
                        return 500;
                    }
                    return returnValue;
                }

                return (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: 20,
                            marginTop: -10,
                        }}
                    >
                        <div
                            style={{ fontWeight: "bold", marginRight: "10px" }}
                        >
                            {t("Length")}:
                        </div>
                        <div style={{}}>
                            <input
                                type="number"
                                min="0"
                                max="9999"
                                pattern="\d{1,4}"
                                maxLength="4"
                                defaultValue={value.targetLength}
                                onBlur={(e) => {
                                    onChange({
                                        targetLength: getTargetLength(e),
                                    });
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        onChange({
                                            targetLength: getTargetLength(e),
                                        });
                                    }
                                }}
                            />
                        </div>
                        <div style={{ marginInlineStart: "10px" }}>
                            {t("characters")}
                        </div>
                    </div>
                );
            },
        }),
    },
    paraphrase: {
        Icon: Edit,
        title: "Rewrite text",
        dialogClassName: "modal-wide",
        type: "selection",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "PARAPHRASE",
            outputTitle: " ",
            outputType: "compare",
            redoText: "Rewrite this again",
            showInput: true,
            SuggestionInput: SuggestionInput,
        }),
        commitLabel: "Use Updated Text",
    },
    remove_content: {
        Icon: CheckCircle,
        title: "Remove content",
        dialogClassName: "modal-wide",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "REMOVE_CONTENT",
            outputType: "diff",
        }),
        commitLabel: "Use Updated Version",
    },
    // transcribe: {
    //     Icon: FaVideo,
    //     title: "Import from media",
    //     dialogClassName: "modal-narrow",
    //     commitLabel: "Use Transcribed Text",
    //     type: "always-available",
    //     SuggestionsComponent: TranscribePage,
    //     postApply: "clear-headline",
    // },
    topics: {
        Icon: Tag,
        title: "Get topics",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "TOPICS",
            OutputRenderer: ListRenderer,
            outputTitle: "Topics relevant to this article",
        }),
    },
    keywords: {
        Icon: Tag,
        title: "Get search keywords",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "KEYWORDS",
            OutputRenderer: ListRenderer,
            outputTitle: "Keywords relevant to this article",
        }),
    },
    tags: {
        Icon: Tag,
        title: "Get tags",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "TAGS",
            OutputRenderer: ListRenderer,
            outputTitle: "Tags relevant to this article",
        }),
    },
    translate: {
        Icon: Languages,
        title: "Translate",
        dialogClassName: "modal-narrow",
        commitLabel: "Use Translated Text",
        SuggestionsComponent: TranslateModalContent,
        postApply: "clear-headline",
    },
    entities: {
        Icon: List,
        title: "Extract entities",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "ENTITIES",
            OutputRenderer: ({ value }) => {
                return (
                    <ul className="border rounded-md p-2">
                        {value.map((entity, index) => (
                            <li key={index}>
                                <CopyButton
                                    item={`${entity.name}: ${entity.definition}`}
                                />
                                <strong>{entity.name}</strong>
                                <br />
                                {entity.definition}
                            </li>
                        ))}
                    </ul>
                );
            },
            outputTitle: "Entities extracted from text",
        }),
    },
    expand: {
        Icon: Expand,
        title: "Expand this story",
        dialogClassName: "modal-wide",
        SuggestionsComponent: ExpandStoryContent,
    },
    ...customActions,
};

export default actions;
