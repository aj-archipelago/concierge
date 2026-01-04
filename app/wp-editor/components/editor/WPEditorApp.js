import React, { useContext } from "react";
import AIModal from "./AIModal";
import HeadlineModal from "./headline/HeadlineModal";
import { getTextSuggestionsComponent } from "./TextSuggestions";
import TaxonomySuggestions from "./TaxonomySuggestions";
import EntitySuggestions from "./EntitySuggestions";
import TranslateModalContent from "./TranslateModalContent";
import CompleteSuggestions from "./CompleteSuggestions";
import ReadabilitySuggestions from "./ReadabilitySuggestions";
import ImportSuggestions from "./ImportSuggestions";
import InternalLinksDiff from "./InternalLinksDiff";
import NewStyleGuideWrapper from "./NewStyleGuideWrapper";
import i18n from "../../../../src/i18n";
import { DataContext } from "../../contexts/DataProvider";

const WPEditorApp = () => {
    const { aiModules } = useContext(DataContext);

    // Use context aiModules or fallback to window for backward compatibility
    const isLiveBlogUpdate =
        aiModules?.postType === "liveblog-update" ||
        (typeof window !== "undefined" &&
            window?.AIModules?.postType === "liveblog-update");

    return (
        <div className="ucms-react-editor" id="ucms-react-editor">
            <AIModal
                command="generateHeadline"
                title={
                    isLiveBlogUpdate
                        ? i18n.t("Headline")
                        : i18n.t("Headline and summary")
                }
                SuggestionsComponent={HeadlineModal}
                commitText={
                    isLiveBlogUpdate
                        ? i18n.t("Use Selected Headline")
                        : i18n.t("Use Selected Headline and Summary")
                }
            />
            <AIModal
                command="correctGrammar"
                title={i18n.t("Spelling and Grammar")}
                SuggestionsComponent={getTextSuggestionsComponent({
                    query: "GRAMMAR",
                    outputType: "diff",
                })}
                commitText={i18n.t("Use Corrected Version")}
                allowSelection={true}
            />
            <AIModal
                command="paraphrase"
                title={i18n.t("Rewrite Text")}
                SuggestionsComponent={getTextSuggestionsComponent({
                    query: "PARAPHRASE",
                    outputTitle: i18n.t("Revised Version"),
                    redoText: i18n.t("Rewrite this again"),
                    SuggestionInput: getTextSuggestionsComponent({
                        inputTitle: i18n.t("Original Text"),
                    }),
                })}
                commitText={i18n.t("Use Selected Text")}
                allowSelection={true}
            />
            <AIModal
                command="generate_topics"
                title={i18n.t("Topics")}
                SuggestionsComponent={(props) => (
                    <TaxonomySuggestions query="TOPICS" {...props} />
                )}
                commitText={i18n.t("Use Selected Taxonomies")}
                allowSelection={false}
            />
            <AIModal
                command="styleGuide"
                title={i18n.t("Style Guide")}
                SuggestionsComponent={NewStyleGuideWrapper}
                commitText={i18n.t("Use Corrected Text")}
                allowSelection={true}
            />
            <AIModal
                command="getEntities"
                title={i18n.t("Entities")}
                SuggestionsComponent={EntitySuggestions}
            />
            <AIModal
                command="translate"
                title={i18n.t("Translate")}
                SuggestionsComponent={TranslateModalContent}
                commitText={i18n.t("Use Translated Version")}
                allowSelection={true}
            />
            <AIModal
                command="complete"
                title={i18n.t("Complete this article")}
                SuggestionsComponent={CompleteSuggestions}
                commitText={i18n.t("Use Completed Version")}
                allowSelection={true}
            />
            <AIModal
                command="readability"
                title={i18n.t("Readability issues")}
                SuggestionsComponent={ReadabilitySuggestions}
            />
            <AIModal
                command="aiImportPosts"
                title={i18n.t("Import Posts")}
                SuggestionsComponent={ImportSuggestions}
            />
            <AIModal
                command="internalLinks"
                title={i18n.t("Internal Link Generator")}
                SuggestionsComponent={InternalLinksDiff}
                commitText={i18n.t("Apply Changes")}
                cancelText={i18n.t("Cancel")}
                allowSelection={true}
                dialogClassName="internal-links-modal"
            />
        </div>
    );
};

export default WPEditorApp;
