import { ApolloClient, InMemoryCache, gql } from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { split, HttpLink } from "@apollo/client";
import { getMainDefinition } from "@apollo/client/utilities";
import config from "../config";

const CORTEX_GRAPHQL_API_URL =
    process.env.CORTEX_GRAPHQL_API_URL || "http://localhost:4000/graphql";

const getClient = (serverUrl) => {
    let graphqlEndpoint;
    if (serverUrl) {
        graphqlEndpoint = config.endpoints.graphql(serverUrl);
    } else {
        graphqlEndpoint = CORTEX_GRAPHQL_API_URL;
    }

    const httpLink = new HttpLink({
        uri: graphqlEndpoint,
    });

    const wsLink = new GraphQLWsLink(
        createClient({
            url: graphqlEndpoint.replace("http", "ws"),
        }),
    );

    // The split function takes three parameters:
    //
    // * A function that's called for each operation to execute
    // * The Link to use for an operation if the function returns a "truthy" value
    // * The Link to use for an operation if the function returns a "falsy" value
    const splitLink = split(
        ({ query }) => {
            const definition = getMainDefinition(query);
            return (
                definition.kind === "OperationDefinition" &&
                definition.operation === "subscription"
            );
        },
        wsLink,
        httpLink,
    );

    const client = new ApolloClient({
        link: splitLink,
        cache: new InMemoryCache(),
    });

    return client;
};

const SUMMARY = gql`
    query Summary($text: String!, $async: Boolean, $targetLength: Int) {
        summary(text: $text, async: $async, targetLength: $targetLength) {
            result
        }
    }
`;

const SUMMARIZE_TURBO = gql`
    query SummarizeTurbo($text: String!, $targetLength: Int) {
        summarize_turbo(text: $text, targetLength: $targetLength) {
            result
        }
    }
`;

const SELECT_SERVICES = gql`
    query SelectServices($text: String!, $async: Boolean) {
        select_services(text: $text, async: $async) {
            result
        }
    }
`;

const SELECT_EXTENSION = gql`
    query SelectExtension($text: String!, $async: Boolean) {
        select_extension(text: $text, async: $async) {
            result
        }
    }
`;

const CHAT_PERSIST = gql`
    query ChatPersist($chatHistory: [Message]!, $contextId: String) {
        chat_persist(chatHistory: $chatHistory, contextId: $contextId) {
            result
            contextId
        }
    }
`;

const CHAT_LABEEB = gql`
    query ChatLabeeb($chatHistory: [Message]!, $contextId: String) {
        chat_labeeb(chatHistory: $chatHistory, contextId: $contextId) {
            result
            contextId
        }
    }
`;

const CHAT_EXTENSION = gql`
    query ChatExtension(
        $chatHistory: [Message]!
        $contextId: String
        $text: String
        $roleInformation: String
        $indexName: String
        $semanticConfiguration: String
    ) {
        retrieval(
            chatHistory: $chatHistory
            contextId: $contextId
            text: $text
            roleInformation: $roleInformation
            indexName: $indexName
            semanticConfiguration: $semanticConfiguration
        ) {
            result
            contextId
            tool
        }
    }
`;

const VISION = gql`
    query ($text: String, $chatHistory: [MultiMessage]) {
        vision(text: $text, chatHistory: $chatHistory) {
            result
            contextId
        }
    }
`;

const RAG_SAVE_MEMORY = gql`
    query RagSaveMemory(
        $aiMemory: String!,
        $contextId: String!,
    ) {
        rag_save_memory(
            aiMemory: $aiMemory,
            contextId: $contextId
        ) {
            result
        }
    }
`;

const RAG_START = gql`
    query RagStart(
        $chatHistory: [MultiMessage]!
        $dataSources: [String]
        $contextId: String
        $text: String
        $roleInformation: String
        $indexName: String
        $semanticConfiguration: String
        $aiName: String
        $aiMemorySelfModify: Boolean
    ) {
        rag_start(
            chatHistory: $chatHistory
            dataSources: $dataSources
            contextId: $contextId
            text: $text
            roleInformation: $roleInformation
            indexName: $indexName
            semanticConfiguration: $semanticConfiguration
            aiName: $aiName
            aiMemorySelfModify: $aiMemorySelfModify
        ) {
            result
            contextId
            tool
        }
    }
`;

const RAG_GENERATOR_RESULTS = gql`
    query RagFinish(
        $chatHistory: [MultiMessage]!
        $dataSources: [String]
        $contextId: String
        $text: String
        $roleInformation: String
        $indexName: String
        $semanticConfiguration: String
        $aiName: String
    ) {
        rag_generator_results(
            chatHistory: $chatHistory
            dataSources: $dataSources
            contextId: $contextId
            text: $text
            roleInformation: $roleInformation
            indexName: $indexName
            semanticConfiguration: $semanticConfiguration
            aiName: $aiName
        ) {
            result
            contextId
            tool
        }
    }
`;

const COGNITIVE_INSERT = gql`
    query CognitiveInsert(
        $text: String
        $file: String
        $contextId: String
        $docId: String
        $privateData: Boolean
        $async: Boolean
    ) {
        cognitive_insert(
            text: $text
            file: $file
            contextId: $contextId
            docId: $docId
            privateData: $privateData
            async: $async
        ) {
            result
        }
    }
`;

const COGNITIVE_DELETE = gql`
    query CognitiveDelete($text: String, $contextId: String, $docId: String) {
        cognitive_delete(text: $text, contextId: $contextId, docId: $docId) {
            result
        }
    }
`;

const CHAT_CODE = gql`
    query ChatCode($text: String, $async: Boolean, $chatHistory: [Message]!) {
        chat_code(text: $text, async: $async, chatHistory: $chatHistory) {
            result
            previousResult
        }
    }
`;

const EXPAND_STORY = gql`
    query ExpandStory($text: String) {
        expand_story(text: $text) {
            result
        }
    }
`;

const HASHTAGS = gql`
    query Hashtags($text: String!) {
        hashtags(text: $text) {
            result
        }
    }
`;

const HEADLINE = gql`
    query Headline($text: String!, $seoOptimized: Boolean) {
        headline(text: $text, seoOptimized: $seoOptimized) {
            result
            debug
        }
    }
`;

const FORMAT_PARAGRAPH_TURBO = gql`
    query FormatParaghraphTurbo($text: String!, $async: Boolean) {
        format_paragraph_turbo(text: $text, async: $async) {
            result
        }
    }
`;

const GRAMMAR = gql`
    query Grammar($text: String!, $async: Boolean) {
        grammar(text: $text, async: $async) {
            result
        }
    }
`;

const STYLE_GUIDE = gql`
    query StyleGuide($text: String!, $async: Boolean) {
        styleguide(text: $text, async: $async) {
            result
        }
    }
`;

const SPELLING = gql`
    query Spelling($text: String!, $async: Boolean) {
        spelling(text: $text, async: $async) {
            result
        }
    }
`;

const PARAPHRASE = gql`
    query Paraphrase($text: String!, $async: Boolean) {
        paraphrase(text: $text, async: $async) {
            result
        }
    }
`;

const TOPICS = gql`
    query Topics(
        $text: String!
        $topics: String
        $count: Int
        $async: Boolean
    ) {
        topics(text: $text, topics: $topics, count: $count, async: $async) {
            result
        }
    }
`;

const KEYWORDS = gql`
    query Keywords($text: String!, $async: Boolean) {
        keywords(text: $text, async: $async) {
            result
        }
    }
`;

const TAGS = gql`
    query Tags($text: String!, $tags: String, $async: Boolean) {
        tags(text: $text, tags: $tags, async: $async) {
            result
        }
    }
`;

const TRANSCRIBE = gql`
    query Transcribe(
        $file: String!
        $text: String
        $language: String
        $wordTimestamped: Boolean
        $maxLineCount: Int
        $maxLineWidth: Int
        $maxWordsPerLine: Int
        $highlightWords: Boolean
        $responseFormat: String
        $async: Boolean
    ) {
        transcribe(
            file: $file
            text: $text
            language: $language
            wordTimestamped: $wordTimestamped
            maxLineCount: $maxLineCount
            maxLineWidth: $maxLineWidth
            maxWordsPerLine: $maxWordsPerLine
            highlightWords: $highlightWords
            responseFormat: $responseFormat
            async: $async
        ) {
            result
        }
    }
`;

const TRANSLATE = gql`
    query Translate($text: String!, $to: String!) {
        translate(text: $text, to: $to) {
            result
        }
    }
`;

const TRANSLATE_CONTEXT = gql`
    query TranslateContext($text: String!, $to: String!) {
        translate_context(text: $text, to: $to) {
            result
        }
    }
`;

const TRANSLATE_TURBO = gql`
    query TranslateTurbo($text: String!, $to: String!) {
        translate_turbo(text: $text, to: $to) {
            result
        }
    }
`;

const TRANSLATE_GPT4 = gql`
    query TranslateGpt4($text: String!, $to: String!, $async: Boolean) {
        translate_gpt4(text: $text, to: $to, async: $async) {
            result
        }
    }
`;

const TRANSLATE_GPT4_TURBO = gql`
    query TranslateGpt4Turbo($text: String!, $to: String!) {
        translate_gpt4_turbo(text: $text, to: $to) {
            result
        }
    }
`;

const TRANSLATE_AZURE = gql`
    query TranslateAzure($text: String!, $to: String!) {
        translate_azure(text: $text, to: $to) {
            result
        }
    }
`;

const ENTITIES = gql`
    query Entities($text: String!, $async: Boolean) {
        entities(text: $text, async: $async) {
            result {
                name
                definition
            }
        }
    }
`;

const REQUEST_PROGRESS = gql`
    subscription RequestProgress($requestIds: [String!]) {
        requestProgress(requestIds: $requestIds) {
            data
            progress
        }
    }
`;

const CANCEL_REQUEST = gql`
    mutation CancelRequest($requestId: String!) {
        cancelRequest(requestId: $requestId)
    }
`;

const HIGHLIGHTS = gql`
    query Highlights($text: String!) {
        highlights(text: $text) {
            result
        }
    }
`;

const REMOVE_CONTENT = gql`
    query RemoveContent($text: String!, $content: String!) {
        remove_content(text: $text, content: $content) {
            result
        }
    }
`;

const TIMELINE = gql`
    query Timeline($text: String!) {
        timeline(text: $text) {
            result
        }
    }
`;

const HEADLINE_CUSTOM = gql`
    query HeadlineCustom(
        $text: String!
        $idea: String
        $style: String
        $keywords: [String]
        $count: Int
        $targetLength: Int
    ) {
        headline_custom(
            text: $text
            idea: $idea
            style: $style
            keywords: $keywords
            count: $count
            targetLength: $targetLength
        ) {
            result
            debug
        }
    }
`;

const SUBHEAD = gql`
    query Subhead(
        $text: String!
        $headline: String
        $count: Int
        $targetLength: Int
    ) {
        subhead(
            text: $text
            headline: $headline
            count: $count
            targetLength: $targetLength
        ) {
            result
            debug
        }
    }
`;

const STORY_ANGLES = gql`
    query StoryAngles($text: String!) {
        story_angles(text: $text) {
            result
        }
    }
`;

const IMAGE = gql`
    query Image($text: String!, $async: Boolean) {
        image(text: $text, async: $async) {
            result
        }
    }
`;

const JIRA_STORY = gql`
    query JiraStory(
        $text: String!
        $storyType: String
        $storyCount: String
        $async: Boolean
    ) {
        jira_story(
            text: $text
            storyType: $storyType
            storyCount: $storyCount
            async: $async
        ) {
            result
        }
    }
`;

const getWorkspacePromptQuery = (pathwayName) => {
    return gql`
        query ${pathwayName}(
            $text: String!
            $systemPrompt: String
            $prompt: String!
            $async: Boolean
        ) {
            ${pathwayName}(
                text: $text
                systemPrompt: $systemPrompt
                prompt: $prompt
                async: $async
            ) {
                result
            }
        }
    `;
};

const QUERIES = {
    CHAT_PERSIST,
    CHAT_LABEEB,
    CHAT_EXTENSION,
    CHAT_CODE,
    COGNITIVE_DELETE,
    COGNITIVE_INSERT,
    IMAGE,
    RAG_SAVE_MEMORY,
    RAG_START,
    RAG_GENERATOR_RESULTS,
    EXPAND_STORY,
    FORMAT_PARAGRAPH_TURBO,
    SELECT_SERVICES,
    SELECT_EXTENSION,
    SUMMARY,
    HASHTAGS,
    HEADLINE,
    GRAMMAR,
    SPELLING,
    PARAPHRASE,
    TOPICS,
    KEYWORDS,
    TAGS,
    JIRA_STORY,
    getWorkspacePromptQuery,
    STYLE_GUIDE,
    ENTITIES,
    STORY_ANGLES,
    SUMMARIZE_TURBO,
    TRANSCRIBE,
    TRANSLATE,
    TRANSLATE_AZURE,
    TRANSLATE_CONTEXT,
    TIMELINE,
    TRANSLATE_TURBO,
    TRANSLATE_GPT4,
    TRANSLATE_GPT4_TURBO,
    HIGHLIGHTS,
    REMOVE_CONTENT,
    HEADLINE_CUSTOM,
    SUBHEAD,
    VISION,
};

const SUBSCRIPTIONS = {
    REQUEST_PROGRESS,
};

const MUTATIONS = {
    CANCEL_REQUEST,
};

export {
    getClient,
    CHAT_PERSIST,
    CHAT_LABEEB,
    CHAT_CODE,
    COGNITIVE_INSERT,
    COGNITIVE_DELETE,
    EXPAND_STORY,
    RAG_SAVE_MEMORY,
    RAG_START,
    RAG_GENERATOR_RESULTS,
    SELECT_SERVICES,
    SUMMARY,
    HASHTAGS,
    HEADLINE,
    GRAMMAR,
    SPELLING,
    PARAPHRASE,
    TOPICS,
    KEYWORDS,
    STORY_ANGLES,
    STYLE_GUIDE,
    ENTITIES,
    QUERIES,
    SUBSCRIPTIONS,
    MUTATIONS,
    SUMMARIZE_TURBO,
    TRANSLATE,
    TRANSLATE_AZURE,
    TRANSLATE_CONTEXT,
    TIMELINE,
    TRANSLATE_TURBO,
    TRANSLATE_GPT4,
    TRANSLATE_GPT4_TURBO,
    HIGHLIGHTS,
    REMOVE_CONTENT,
    JIRA_STORY,
    VISION,
};
