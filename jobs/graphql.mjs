import { gql } from "@apollo/client/index.js";

const CORTEX_GRAPHQL_API_URL =
    process.env.CORTEX_GRAPHQL_API_URL || "http://localhost:4000/graphql";

const getClient = async (serverUrl) => {
    const apollo = await import("@apollo/client/index.js");
    const { ApolloClient, InMemoryCache, split, HttpLink } = apollo;
    const { GraphQLWsLink } = await import(
        "@apollo/client/link/subscriptions/index.js"
    );
    const { createClient } = await import("graphql-ws");
    const { getMainDefinition } = await import(
        "@apollo/client/utilities/index.js"
    );
    const WebSocket = await import("ws");

    let graphqlEndpoint;
    if (serverUrl) {
        graphqlEndpoint = serverUrl;
    } else {
        graphqlEndpoint = CORTEX_GRAPHQL_API_URL;
    }

    const httpLink = new HttpLink({
        uri: graphqlEndpoint,
    });

    const wsLink = new GraphQLWsLink(
        createClient({
            url: graphqlEndpoint.replace("http", "ws"),
            webSocketImpl: WebSocket.default,
            connectionParams: {},
            on: {
                connected: () => console.log("GraphQL WebSocket connected"),
                error: (error) =>
                    console.error("GraphQL WebSocket error:", error),
                closed: () => console.log("GraphQL WebSocket closed"),
            },
        }),
    );

    // Split requests between WebSocket and HTTP
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

const VISION = gql`
    query ($text: String, $chatHistory: [MultiMessage]) {
        vision(text: $text, chatHistory: $chatHistory) {
            result
            contextId
        }
    }
`;

const SYS_SAVE_MEMORY = gql`
    query SysSaveMemory($aiMemory: String!, $contextId: String!) {
        sys_save_memory(aiMemory: $aiMemory, contextId: $contextId) {
            result
        }
    }
`;

const CODE_HUMAN_INPUT = gql`
    query ($text: String, $codeRequestId: String) {
        code_human_input(text: $text, codeRequestId: $codeRequestId) {
            result
        }
    }
`;

const SYS_ENTITY_AGENT = gql`
    query RagStart(
        $chatHistory: [MultiMessage]!
        $contextId: String
        $text: String
        $aiName: String
        $aiMemorySelfModify: Boolean
        $aiStyle: String
        $title: String
        $codeRequestId: String
        $stream: Boolean
        $entityId: String
        $chatId: String
    ) {
        sys_entity_agent(
            chatHistory: $chatHistory
            contextId: $contextId
            text: $text
            aiName: $aiName
            aiMemorySelfModify: $aiMemorySelfModify
            aiStyle: $aiStyle
            title: $title
            codeRequestId: $codeRequestId
            stream: $stream
            entityId: $entityId
            chatId: $chatId
        ) {
            result
            contextId
            tool
            warnings
            errors
        }
    }
`;

const COGNITIVE_INSERT = gql`
    query CognitiveInsert(
        $text: String
        $file: String
        $contextId: String
        $docId: String
        $chatId: String
        $privateData: Boolean
        $async: Boolean
    ) {
        cognitive_insert(
            text: $text
            file: $file
            contextId: $contextId
            docId: $docId
            chatId: $chatId
            privateData: $privateData
            async: $async
        ) {
            result
        }
    }
`;

const COGNITIVE_DELETE = gql`
    query CognitiveDelete(
        $text: String
        $contextId: String
        $docId: String
        $chatId: String
    ) {
        cognitive_delete(
            text: $text
            contextId: $contextId
            docId: $docId
            chatId: $chatId
        ) {
            result
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
    query Headline(
        $text: String!
        $seoOptimized: Boolean
        $count: Int
        $targetLength: Int
    ) {
        headline(
            text: $text
            seoOptimized: $seoOptimized
            count: $count
            targetLength: $targetLength
        ) {
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

const GREETING = gql`
    query Greeting(
        $text: String!
        $async: Boolean
        $contextId: String
        $aiName: String
    ) {
        greeting(
            text: $text
            async: $async
            contextId: $contextId
            aiName: $aiName
        ) {
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

const TRANSCRIBE_NEURALSPACE = gql`
    query TranscribeNeuralSpace(
        $file: String!
        $language: String
        $wordTimestamped: Boolean
        $responseFormat: String
        $maxLineCount: Int
        $maxLineWidth: Int
        $maxWordsPerLine: Int
        $highlightWords: Boolean
        $async: Boolean
    ) {
        transcribe_neuralspace(
            file: $file
            language: $language
            wordTimestamped: $wordTimestamped
            responseFormat: $responseFormat
            maxLineCount: $maxLineCount
            maxLineWidth: $maxLineWidth
            maxWordsPerLine: $maxWordsPerLine
            highlightWords: $highlightWords
            async: $async
        ) {
            result
        }
    }
`;

const TRANSCRIBE_GEMINI = gql`
    query TranscribeGemini(
        $file: String!
        $language: String
        $wordTimestamped: Boolean
        $responseFormat: String
        $maxLineCount: Int
        $maxLineWidth: Int
        $maxWordsPerLine: Int
        $highlightWords: Boolean
        $async: Boolean
    ) {
        transcribe_gemini(
            file: $file
            language: $language
            wordTimestamped: $wordTimestamped
            responseFormat: $responseFormat
            maxLineCount: $maxLineCount
            maxLineWidth: $maxLineWidth
            maxWordsPerLine: $maxWordsPerLine
            highlightWords: $highlightWords
            async: $async
        ) {
            result
        }
    }
`;

const TRANSLATE_SUBTITLE = gql`
    query TranslateSubtitle($text: String, $to: String, $async: Boolean) {
        translate_subtitle(text: $text, to: $to, async: $async) {
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

const TRANSLATE_GPT4_OMNI = gql`
    query TranslateGpt4Omni($text: String!, $to: String!) {
        translate_gpt4_omni(text: $text, to: $to) {
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
    subscription Task($requestIds: [String!]) {
        requestProgress(requestIds: $requestIds) {
            data
            progress
            info
            error
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

const IMAGE_FLUX = gql`
    query ImageFlux(
        $text: String!
        $model: String
        $async: Boolean
        $input_image: String
        $input_image_2: String
        $aspectRatio: String
    ) {
        image_flux(
            text: $text
            model: $model
            async: $async
            input_image: $input_image
            input_image_2: $input_image_2
            aspectRatio: $aspectRatio
        ) {
            result
        }
    }
`;

const VIDEO_VEO = gql`
    query VideoVeo(
        $text: String!
        $async: Boolean
        $image: String
        $video: String
        $lastFrame: String
        $model: String
        $aspectRatio: String
        $durationSeconds: Int
        $enhancePrompt: Boolean
        $generateAudio: Boolean
        $negativePrompt: String
        $personGeneration: String
        $sampleCount: Int
        $storageUri: String
        $location: String
        $seed: Int
    ) {
        video_veo(
            text: $text
            async: $async
            image: $image
            video: $video
            lastFrame: $lastFrame
            model: $model
            aspectRatio: $aspectRatio
            durationSeconds: $durationSeconds
            enhancePrompt: $enhancePrompt
            generateAudio: $generateAudio
            negativePrompt: $negativePrompt
            personGeneration: $personGeneration
            sampleCount: $sampleCount
            storageUri: $storageUri
            location: $location
            seed: $seed
        ) {
            result
        }
    }
`;

const VIDEO_SEEDANCE = gql`
    query VideoSeedance(
        $text: String!
        $async: Boolean
        $model: String
        $resolution: String
        $aspectRatio: String
        $duration: Int
        $image: String
        $seed: Int
        $camera_fixed: Boolean
    ) {
        video_seedance(
            text: $text
            async: $async
            model: $model
            resolution: $resolution
            aspectRatio: $aspectRatio
            duration: $duration
            image: $image
            seed: $seed
            camera_fixed: $camera_fixed
        ) {
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

const AZURE_VIDEO_TRANSLATE = gql`
    query (
        $mode: String
        $sourcelocale: String
        $targetlocale: String
        $sourcevideooraudiofilepath: String
        $stream: Boolean
    ) {
        azure_video_translate(
            mode: $mode
            sourcelocale: $sourcelocale
            targetlocale: $targetlocale
            sourcevideooraudiofilepath: $sourcevideooraudiofilepath
            stream: $stream
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
                tool
            }
        }
    `;
};

const QUERIES = {
    AZURE_VIDEO_TRANSLATE,
    COGNITIVE_DELETE,
    COGNITIVE_INSERT,
    IMAGE,
    IMAGE_FLUX,
    VIDEO_VEO,
    VIDEO_SEEDANCE,
    SYS_SAVE_MEMORY,
    SYS_ENTITY_AGENT,
    EXPAND_STORY,
    FORMAT_PARAGRAPH_TURBO,
    SELECT_SERVICES,
    SELECT_EXTENSION,
    SUMMARY,
    HASHTAGS,
    HEADLINE,
    GREETING,
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
    TRANSCRIBE_NEURALSPACE,
    TRANSCRIBE_GEMINI,
    TRANSLATE,
    TRANSLATE_AZURE,
    TRANSLATE_CONTEXT,
    TIMELINE,
    TRANSLATE_TURBO,
    TRANSLATE_GPT4,
    TRANSLATE_GPT4_TURBO,
    TRANSLATE_GPT4_OMNI,
    TRANSLATE_SUBTITLE,
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
    AZURE_VIDEO_TRANSLATE,
    getClient,
    COGNITIVE_INSERT,
    COGNITIVE_DELETE,
    EXPAND_STORY,
    SYS_SAVE_MEMORY,
    SYS_ENTITY_AGENT,
    SELECT_SERVICES,
    SUMMARY,
    HASHTAGS,
    HEADLINE,
    IMAGE_FLUX,
    VIDEO_VEO,
    VIDEO_SEEDANCE,
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
    TRANSLATE_SUBTITLE,
    HIGHLIGHTS,
    REMOVE_CONTENT,
    JIRA_STORY,
    VISION,
    TRANSCRIBE,
    TRANSCRIBE_NEURALSPACE,
    TRANSCRIBE_GEMINI,
    FORMAT_PARAGRAPH_TURBO,
    CODE_HUMAN_INPUT,
};
