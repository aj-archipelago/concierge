import {
    ApolloClient,
    InMemoryCache,
} from "@apollo/experimental-nextjs-app-support";
import { gql } from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { split, HttpLink, from } from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { getMainDefinition } from "@apollo/client/utilities";
import config from "../config";
import { triggerAuthRefresh, checkAuthHeaders } from "./utils/auth";

const CORTEX_GRAPHQL_API_URL =
    process.env.CORTEX_GRAPHQL_API_URL || "http://localhost:4000/graphql";

// Track authentication state for GraphQL
let isGraphQLRefreshing = false;

const getClient = (serverUrl, useBlueGraphQL) => {
    let graphqlEndpoint;
    if (serverUrl) {
        graphqlEndpoint = config.endpoints.graphql(serverUrl, useBlueGraphQL);
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

    // Add error handling link for authentication errors
    const errorLink = onError(
        ({ networkError, graphQLErrors, operation, forward }) => {
            // Skip auth error handling for auth-related endpoints
            if (
                operation.operationName?.includes("auth") ||
                operation.operationName?.includes("Auth") ||
                operation.operationName?.includes("login")
            ) {
                return;
            }

            // Handle 401 Unauthorized errors
            if (networkError && networkError.statusCode === 401) {
                if (!isGraphQLRefreshing) {
                    isGraphQLRefreshing = true;

                    (async () => {
                        try {
                            // Check if we need to refresh auth
                            const isAuthenticated = await checkAuthHeaders();
                            if (!isAuthenticated) {
                                await triggerAuthRefresh();
                            }
                        } catch (error) {
                            console.error("GraphQL auth refresh error:", error);
                        } finally {
                            isGraphQLRefreshing = false;
                        }
                    })();
                }
            }

            // Handle other network errors
            if (networkError) {
                console.error("GraphQL network error:", networkError);
                // Don't retry connection refused errors - they indicate the service is down
                if (
                    networkError.statusCode === 0 ||
                    networkError.message?.includes("ECONNREFUSED")
                ) {
                    return;
                }
            }

            // Handle GraphQL errors
            if (graphQLErrors) {
                graphQLErrors.forEach(({ message, locations, path }) => {
                    console.error(
                        `GraphQL error: Message: ${message}, Location: ${locations}, Path: ${path}`,
                    );
                });
            }
        },
    );

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

    return new ApolloClient({
        link: from([errorLink, splitLink]),
        cache: new InMemoryCache(),
        defaultOptions: {
            watchQuery: {
                errorPolicy: "all",
            },
            query: {
                errorPolicy: "all",
            },
        },
    });
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

const SYS_READ_MEMORY = gql`
    query SysReadMemory(
        $contextId: String!
        $contextKey: String
        $section: String
    ) {
        sys_read_memory(
            contextId: $contextId
            contextKey: $contextKey
            section: $section
        ) {
            result
        }
    }
`;

const SYS_SAVE_MEMORY = gql`
    mutation SysSaveMemory(
        $aiMemory: String!
        $contextId: String!
        $contextKey: String
        $section: String
    ) {
        sys_save_memory(
            aiMemory: $aiMemory
            contextId: $contextId
            contextKey: $contextKey
            section: $section
        ) {
            result
        }
    }
`;

const SYS_READ_FILE_COLLECTION = gql`
    query SysReadFileCollection(
        $contextId: String!
        $contextKey: String
        $useCache: Boolean
    ) {
        sys_read_file_collection(
            contextId: $contextId
            contextKey: $contextKey
            useCache: $useCache
        ) {
            result
        }
    }
`;

const SYS_UPDATE_FILE_METADATA = gql`
    mutation SysUpdateFileMetadata(
        $contextId: String!
        $contextKey: String
        $hash: String!
        $displayFilename: String
        $tags: [String!]
        $notes: String
        $mimeType: String
        $permanent: Boolean
    ) {
        sys_update_file_metadata(
            contextId: $contextId
            contextKey: $contextKey
            hash: $hash
            displayFilename: $displayFilename
            tags: $tags
            notes: $notes
            mimeType: $mimeType
            permanent: $permanent
        ) {
            result
        }
    }
`;

const CHAT_TITLE = gql`
    query Chat_title(
        $text: String
        $title: String
        $chatHistory: [MultiMessage]
    ) {
        chat_title(text: $text, title: $title, chatHistory: $chatHistory) {
            result
        }
    }
`;

const SYS_ENTITY_AGENT = gql`
    query StartAgent(
        $chatHistory: [MultiMessage]!
        $contextId: String
        $contextKey: String
        $text: String
        $aiName: String
        $aiMemorySelfModify: Boolean
        $title: String
        $codeRequestId: String
        $stream: Boolean
        $entityId: String
        $chatId: String
        $researchMode: Boolean
        $model: String
        $userInfo: String
    ) {
        sys_entity_agent(
            chatHistory: $chatHistory
            contextId: $contextId
            contextKey: $contextKey
            text: $text
            aiName: $aiName
            aiMemorySelfModify: $aiMemorySelfModify
            title: $title
            codeRequestId: $codeRequestId
            stream: $stream
            entityId: $entityId
            chatId: $chatId
            researchMode: $researchMode
            model: $model
            userInfo: $userInfo
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

const GRAMMAR = gql`
    query Grammar($text: String!, $async: Boolean) {
        grammar(text: $text, async: $async) {
            result
        }
    }
`;

const GRAMMAR_AR = gql`
    query GrammarAr($text: String!, $async: Boolean) {
        grammar_ar(text: $text, async: $async) {
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

const TRANSCRIBE_GEMINI = gql`
    query TranscribeGemini(
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
        $contextId: String
    ) {
        transcribe_gemini(
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
            contextId: $contextId
        ) {
            result
        }
    }
`;

const TRANSCRIBE_NEURALSPACE = gql`
    query TranscribeNeuralSpace(
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
        transcribe_neuralspace(
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

const TRANSLATE_SUBTITLE = gql`
    query TranslateSubtitle(
        $text: String
        $to: String
        $async: Boolean
        $format: String
    ) {
        translate_subtitle(
            text: $text
            to: $to
            async: $async
            format: $format
        ) {
            result
        }
    }
`;

const TRANSLATE = gql`
    query Translate($text: String!, $to: String!, $model: String) {
        translate(text: $text, to: $to, model: $model) {
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

const IMAGE_GEMINI_25 = gql`
    query ImageGemini25(
        $text: String!
        $async: Boolean
        $input_image: String
        $input_image_2: String
        $input_image_3: String
        $optimizePrompt: Boolean
    ) {
        image_gemini_25(
            text: $text
            async: $async
            input_image: $input_image
            input_image_2: $input_image_2
            input_image_3: $input_image_3
            optimizePrompt: $optimizePrompt
        ) {
            result
            resultData
        }
    }
`;

const IMAGE_GEMINI_3 = gql`
    query ImageGemini3(
        $text: String!
        $async: Boolean
        $input_image: String
        $input_image_2: String
        $input_image_3: String
        $input_image_4: String
        $input_image_5: String
        $input_image_6: String
        $input_image_7: String
        $input_image_8: String
        $input_image_9: String
        $input_image_10: String
        $input_image_11: String
        $input_image_12: String
        $input_image_13: String
        $input_image_14: String
        $optimizePrompt: Boolean
        $aspectRatio: String
        $image_size: String
    ) {
        image_gemini_3(
            text: $text
            async: $async
            input_image: $input_image
            input_image_2: $input_image_2
            input_image_3: $input_image_3
            input_image_4: $input_image_4
            input_image_5: $input_image_5
            input_image_6: $input_image_6
            input_image_7: $input_image_7
            input_image_8: $input_image_8
            input_image_9: $input_image_9
            input_image_10: $input_image_10
            input_image_11: $input_image_11
            input_image_12: $input_image_12
            input_image_13: $input_image_13
            input_image_14: $input_image_14
            optimizePrompt: $optimizePrompt
            aspectRatio: $aspectRatio
            image_size: $image_size
        ) {
            result
            resultData
        }
    }
`;

const IMAGE_QWEN = gql`
    query ImageQwen(
        $text: String!
        $model: String!
        $async: Boolean
        $negativePrompt: String
        $width: Int
        $height: Int
        $aspectRatio: String
        $numberResults: Int
        $output_format: String
        $output_quality: Int
        $input_image: String
        $input_image_2: String
        $input_image_3: String
        $go_fast: Boolean
        $guidance: Float
        $strength: Float
        $image_size: String
        $lora_scale: Float
        $enhance_prompt: Boolean
        $num_inference_steps: Int
        $disable_safety_checker: Boolean
    ) {
        image_qwen(
            text: $text
            model: $model
            async: $async
            negativePrompt: $negativePrompt
            width: $width
            height: $height
            aspectRatio: $aspectRatio
            numberResults: $numberResults
            output_format: $output_format
            output_quality: $output_quality
            input_image: $input_image
            input_image_2: $input_image_2
            input_image_3: $input_image_3
            go_fast: $go_fast
            guidance: $guidance
            strength: $strength
            image_size: $image_size
            lora_scale: $lora_scale
            enhance_prompt: $enhance_prompt
            num_inference_steps: $num_inference_steps
            disable_safety_checker: $disable_safety_checker
        ) {
            result
        }
    }
`;

const IMAGE_SEEDREAM4 = gql`
    query ImageSeedream4(
        $text: String!
        $model: String!
        $async: Boolean
        $size: String
        $width: Int
        $height: Int
        $aspectRatio: String
        $maxImages: Int
        $numberResults: Int
        $input_image: String
        $input_image_1: String
        $input_image_2: String
        $input_image_3: String
        $sequentialImageGeneration: String
        $seed: Int
    ) {
        image_seedream4(
            text: $text
            model: $model
            async: $async
            size: $size
            width: $width
            height: $height
            aspectRatio: $aspectRatio
            maxImages: $maxImages
            numberResults: $numberResults
            input_image: $input_image
            input_image_1: $input_image_1
            input_image_2: $input_image_2
            input_image_3: $input_image_3
            sequentialImageGeneration: $sequentialImageGeneration
            seed: $seed
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

const CODE_HUMAN_INPUT = gql`
    query ($text: String, $codeRequestId: String) {
        code_human_input(text: $text, codeRequestId: $codeRequestId) {
            result
        }
    }
`;

const getWorkspacePromptQuery = (pathwayName) => {
    return gql`
        query ${pathwayName}(
            $chatHistory: [MultiMessage]
            $async: Boolean
            $model: String
            $contextId: String
        ) {
            ${pathwayName}(
                chatHistory: $chatHistory
                async: $async
                model: $model
                contextId: $contextId
            ) {
                result
                tool
            }
        }
    `;
};

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

const SYS_GET_ENTITIES = gql`
    query Sys_get_entities {
        sys_get_entities {
            result
        }
    }
`;

const SYS_TOOL_MERMAID = gql`
    query Sys_tool_mermaid($chatHistory: [MultiMessage], $async: Boolean) {
        sys_tool_mermaid(chatHistory: $chatHistory, async: $async) {
            result
            tool
        }
    }
`;

const WORKSPACE_APPLET_EDIT = gql`
    query WorkspaceAppletEdit(
        $text: String!
        $async: Boolean
        $stream: Boolean
        $promptEndpoint: String
        $fileEndpoint: String
        $dataEndpoint: String
        $currentHtml: String
        $promptDetails: String
    ) {
        workspace_applet_edit(
            text: $text
            promptEndpoint: $promptEndpoint
            dataEndpoint: $dataEndpoint
            fileEndpoint: $fileEndpoint
            currentHtml: $currentHtml
            async: $async
            stream: $stream
            promptDetails: $promptDetails
        ) {
            result
        }
    }
`;

const QUERIES = {
    AZURE_VIDEO_TRANSLATE,
    CHAT_TITLE,
    CODE_HUMAN_INPUT,
    COGNITIVE_DELETE,
    COGNITIVE_INSERT,
    IMAGE,
    IMAGE_FLUX,
    IMAGE_GEMINI_25,
    IMAGE_GEMINI_3,
    VIDEO_VEO,
    VIDEO_SEEDANCE,
    SYS_READ_MEMORY,
    SYS_SAVE_MEMORY,
    SYS_READ_FILE_COLLECTION,
    SYS_UPDATE_FILE_METADATA,
    SYS_ENTITY_AGENT,
    SYS_GET_ENTITIES,
    SYS_TOOL_MERMAID,
    EXPAND_STORY,
    FORMAT_PARAGRAPH_TURBO,
    SELECT_SERVICES,
    SELECT_EXTENSION,
    SUMMARY,
    HASHTAGS,
    HEADLINE,
    GREETING,
    GRAMMAR,
    GRAMMAR_AR,
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
    TRANSLATE_SUBTITLE,
    HIGHLIGHTS,
    REMOVE_CONTENT,
    HEADLINE_CUSTOM,
    SUBHEAD,
    VISION,
    WORKSPACE_APPLET_EDIT,
};

const SUBSCRIPTIONS = {
    REQUEST_PROGRESS,
};

const PUT_PATHWAY = gql`
    mutation PutPathway(
        $name: String!
        $pathway: PathwayInput!
        $userId: String!
        $secret: String!
        $displayName: String
        $key: String!
    ) {
        putPathway(
            name: $name
            pathway: $pathway
            userId: $userId
            secret: $secret
            displayName: $displayName
            key: $key
        ) {
            name
        }
    }
`;

const DELETE_PATHWAY = gql`
    mutation DeletePathway(
        $name: String!
        $userId: String!
        $secret: String!
        $key: String!
    ) {
        deletePathway(name: $name, userId: $userId, secret: $secret, key: $key)
    }
`;

const MUTATIONS = {
    CANCEL_REQUEST,
    PUT_PATHWAY,
    DELETE_PATHWAY,
};

export {
    getClient,
    AZURE_VIDEO_TRANSLATE,
    CODE_HUMAN_INPUT,
    COGNITIVE_INSERT,
    COGNITIVE_DELETE,
    EXPAND_STORY,
    SYS_READ_MEMORY,
    SYS_SAVE_MEMORY,
    SYS_READ_FILE_COLLECTION,
    SYS_UPDATE_FILE_METADATA,
    SYS_ENTITY_AGENT,
    SYS_GET_ENTITIES,
    SYS_TOOL_MERMAID,
    SELECT_SERVICES,
    SUMMARY,
    HASHTAGS,
    HEADLINE,
    IMAGE_FLUX,
    IMAGE_GEMINI_25,
    IMAGE_GEMINI_3,
    IMAGE_QWEN,
    IMAGE_SEEDREAM4,
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
    TRANSLATE_SUBTITLE,
    HIGHLIGHTS,
    REMOVE_CONTENT,
    JIRA_STORY,
    VISION,
    WORKSPACE_APPLET_EDIT,
};
