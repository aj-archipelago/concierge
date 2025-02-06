"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ClipboardIcon,
    LanguagesIcon,
    UploadIcon,
    VideoIcon,
} from "lucide-react";
import { useCallback, useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaVideo } from "react-icons/fa";
import { AuthContext, ServerContext } from "../../App";
import { useProgress } from "../../contexts/ProgressContext";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";
import TranslationOptions from "./TranslationOptions";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { parse, build } from "@aj-archipelago/subvibe";

export function AddTrackOptions({
    url,
    onAdd,
    async = true,
    apolloClient,
    transcripts = [],
    activeTranscript,
    options = ["transcribe", "translate", "upload", "clipboard"],
    defaultTab,
    onClose,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);

    const visibleOptions = options.filter(
        (opt) =>
            (opt === "transcribe" ? url : true) &&
            (opt === "translate" ? transcripts.length > 0 : true),
    );
    const gridCols =
        visibleOptions.length === 1
            ? "grid-cols-1"
            : visibleOptions.length === 2
              ? "grid-cols-2"
              : visibleOptions.length === 3
                ? "grid-cols-3"
                : "grid-cols-4";

    return (
        <Tabs defaultValue={defaultTab || visibleOptions[0]} className="w-full">
            <TabsList className={`grid w-full ${gridCols} mb-4`}>
                {options.includes("transcribe") && (
                    <TabsTrigger value="transcribe">
                        <VideoIcon className="h-4 w-4 me-2" />
                        {t("Transcribe")}
                    </TabsTrigger>
                )}
                {options.includes("translate") && (
                    <TabsTrigger value="translate">
                        <LanguagesIcon className="h-4 w-4 me-2" />
                        {t("Translate")}
                    </TabsTrigger>
                )}
                {options.includes("upload") && (
                    <TabsTrigger value="upload">
                        <UploadIcon className="h-4 w-4 me-2" />
                        {t("Upload")}
                    </TabsTrigger>
                )}
                {options.includes("clipboard") && (
                    <TabsTrigger value="clipboard">
                        <ClipboardIcon className="h-4 w-4 me-2" />
                        {t("Paste")}
                    </TabsTrigger>
                )}
            </TabsList>

            {options.includes("transcribe") && (
                <TabsContent value="transcribe">
                    <p className="text-sm text-gray-500">
                        {t("Transcribe your video")}
                    </p>
                    <TranscribeVideo
                        url={url}
                        onAdd={onAdd}
                        async={async}
                        apolloClient={apolloClient}
                        onClose={onClose}
                    />
                </TabsContent>
            )}

            {options.includes("translate") && (
                <TabsContent value="translate">
                    <div style={{ direction: direction }}>
                        <p className="text-sm text-gray-500">
                            {t("Translate your transcript")}
                        </p>
                        <TranslationOptions
                            transcripts={transcripts}
                            onAdd={onAdd}
                            activeTranscript={activeTranscript}
                            onClose={onClose}
                        />
                    </div>
                </TabsContent>
            )}

            {options.includes("upload") && (
                <TabsContent value="upload">
                    <div style={{ direction: direction }}>
                        <p className="text-sm text-gray-500">
                            {t("Upload subtitles or a transcript")}
                        </p>
                        <SubtitleUpload onAdd={onAdd} />
                    </div>
                </TabsContent>
            )}

            {options.includes("clipboard") && (
                <TabsContent value="clipboard">
                    <div style={{ direction: direction }}>
                        <p className="text-sm text-gray-500">
                            {t("Paste your transcript text from clipboard")}
                        </p>
                        <ClipboardPaste onAdd={onAdd} />
                    </div>
                </TabsContent>
            )}
        </Tabs>
    );
}

function SubtitleUpload({ onAdd }) {
    const { t } = useTranslation();
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef(null);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = async (file) => {
        const fileExtension = file.name.split(".").pop().toLowerCase();

        if (!["srt", "vtt"].includes(fileExtension)) {
            alert(t("Please upload an SRT or VTT file"));
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            let text = e.target.result;

            const parsed = parse(text);

            if (fileExtension === "srt") {
                // Convert SRT to VTT format
                text = build(parsed.cues, "vtt");
            }

            onAdd({
                text: text,
                name: file.name,
                format: "vtt",
            });
        };
        reader.readAsText(file);
    };

    return (
        <div className="flex flex-col gap-4">
            <form
                className={`relative flex flex-col items-center justify-center w-full min-h-[200px] border-2 border-dashed rounded-lg p-4 
                    ${dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".srt,.vtt"
                    onChange={handleChange}
                    className="hidden"
                />
                <UploadIcon className="h-10 w-10 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 text-center">
                    {t(
                        "Drag and drop your subtitle file here or click to browse",
                    )}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                    {t("Supported formats: SRT, VTT")}
                </p>
            </form>
        </div>
    );
}

// Add new ClipboardPaste component
function ClipboardPaste({ onAdd }) {
    const { t } = useTranslation();
    const [text, setText] = useState("");

    const handleSubmit = () => {
        if (!text.trim()) return;

        // Detect if the pasted text is in a subtitle format
        const parsed = parse(text);
        const format = parsed?.type;
        const cues = parsed?.cues;

        let processedText = text;
        let outputFormat = "";
        let name = t("Pasted Transcript");

        if (format === "srt") {
            processedText = build(cues, "vtt");
            outputFormat = "vtt";
            name = t("Pasted Subtitles");
        } else if (format === "vtt") {
            processedText = build(cues, "vtt");
            outputFormat = "vtt";
            name = t("Pasted Subtitles");
        }

        onAdd({
            text: processedText,
            format: outputFormat,
            name: name,
        });
        setText("");
    };

    return (
        <div className="flex flex-col gap-4">
            <textarea
                className="lb-input text-sm"
                placeholder={t("Paste text here...")}
                value={text}
                rows={6}
                onChange={(e) => setText(e.target.value)}
            />
            <div>
                <button
                    className="lb-primary"
                    onClick={handleSubmit}
                    disabled={!text.trim()}
                >
                    {t("Add Text")}
                </button>
            </div>
        </div>
    );
}

const getTranscribeQuery = (modelOption) => {
    switch (modelOption?.toLowerCase()) {
        case "neuralSpace":
            return QUERIES.TRANSCRIBE_NEURALSPACE;
        case "gemini":
            return QUERIES.TRANSCRIBE_GEMINI;
        case "whisper":
            return QUERIES.TRANSCRIBE;
        default:
            return QUERIES.TRANSCRIBE;
    }
};

export default function TranscribeVideo({
    url,
    onAdd,
    async = true,
    apolloClient,
    onClose,
}) {
    const { t } = useTranslation();
    const { neuralspaceEnabled } = useContext(ServerContext);

    const [language, setLanguage] = useState("");
    const [selectedModelOption, setSelectedModelOption] = useState("Whisper");
    const [transcriptionOption, setTranscriptionOption] = useState(null);
    const [requestId, setRequestId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [currentOperation, setCurrentOperation] = useState("");
    const [error, setError] = useState(null);
    const { debouncedUpdateUserState } = useContext(AuthContext);
    const { addProgressToast } = useProgress();

    const {
        responseFormat = "vtt",
        wordTimestamped,
        maxLineCount,
        maxLineWidth,
        maxWordsPerLine,
        highlightWords,
    } = transcriptionOption ?? {};

    const handleSubmit = useCallback(async () => {
        if (!url || loading) return;

        setCurrentOperation(t("Transcribing"));
        try {
            setLoading(true);

            const _query = getTranscribeQuery(selectedModelOption);

            const { data } = await apolloClient.query({
                query: _query,
                variables: {
                    file: url,
                    language,
                    wordTimestamped,
                    responseFormat:
                        responseFormat !== "formatted" ? responseFormat : null,
                    maxLineCount,
                    maxLineWidth,
                    maxWordsPerLine,
                    highlightWords,
                    async: true,
                },
                fetchPolicy: "network-only",
            });

            const dataResult =
                data?.transcribe?.result ||
                data?.transcribe_neuralspace?.result ||
                data?.transcribe_gemini?.result;

            if (dataResult) {
                setRequestId(dataResult);
                addProgressToast(
                    dataResult,
                    t("Transcribing") + "...",
                    async (finalData) => {
                        if (responseFormat === "formatted") {
                            const response = await apolloClient.query({
                                query: QUERIES.FORMAT_PARAGRAPH_TURBO,
                                variables: {
                                    text: finalData,
                                    async: false,
                                },
                            });

                            finalData =
                                response.data?.format_paragraph_turbo?.result;
                        }
                        setLoading(false);
                        onAdd({
                            text: finalData,
                            format: responseFormat,
                            name:
                                responseFormat === "vtt"
                                    ? t("Subtitles")
                                    : t("Transcript"),
                        });
                        setRequestId(null);
                    },
                );
                onClose?.();
            }
        } catch (e) {
            console.error("Transcription error:", e);
            setError(e);
            setLoading(false);
        }
    }, [
        url,
        language,
        wordTimestamped,
        responseFormat,
        maxLineCount,
        maxLineWidth,
        maxWordsPerLine,
        highlightWords,
        loading,
        async,
        addProgressToast,
        t,
        onClose,
        apolloClient,
        selectedModelOption,
    ]);

    // Add logging for select changes
    const handleFormatChange = (e) => {
        const selectedValue = e.target.value;
        setTranscriptionOption({
            responseFormat: selectedValue,
            wordTimestamped: false,
            textFormatted: false,
        });
        debouncedUpdateUserState((prev) => ({
            ...prev,
            outputFormat: selectedValue,
        }));
    };

    const handleTranscriptionTypeChange = (e) => {
        const selectedValue = e.target.value;
        let newOptions = {
            responseFormat,
            wordTimestamped: false,
            textFormatted: false,
            maxLineWidth: undefined,
            maxLineCount: undefined,
        };

        if (selectedValue === "wordLevel") {
            newOptions.wordTimestamped = true;
            newOptions.transcriptionType = "word";
        } else if (selectedValue === "horizontal") {
            newOptions.wordTimestamped = true;
            newOptions.maxLineWidth = 35;
            newOptions.maxLineCount = 1;
        } else if (selectedValue === "vertical") {
            newOptions.wordTimestamped = true;
            newOptions.maxLineWidth = 25;
            newOptions.maxLineCount = 1;
        }

        setTranscriptionOption(newOptions);
        debouncedUpdateUserState((prev) => ({
            ...prev,
            transcriptionType: newOptions.transcriptionType || "",
            maxLineWidth: newOptions.maxLineWidth,
            maxLineCount: newOptions.maxLineCount,
            wordTimestamped: newOptions.wordTimestamped,
        }));
    };

    return (
        <>
            <div>
                <span className="flex items-center pb-2">
                    <label className="text-sm px-1">{t("Using model")}</label>
                    <ModelSelector
                        loading={loading}
                        selectedModelOption={selectedModelOption}
                        setSelectedModelOption={setSelectedModelOption}
                        neuralspaceEnabled={neuralspaceEnabled}
                    />
                </span>
            </div>

            <div className="options-section flex flex-col justify-between gap-2 mb-5 p-2.5 border border-gray-300 rounded-md bg-neutral-100 w-full">
                <div className="flex flex-col">
                    <h5 className="font-semibold text-xs text-gray-400 mb-1">
                        {t("Output format")}
                    </h5>
                    <FormatSelector
                        loading={loading}
                        responseFormat={responseFormat}
                        handleFormatChange={handleFormatChange}
                    />
                </div>

                {responseFormat === "vtt" && (
                    <div className={`flex flex-col`}>
                        <h5 className="font-semibold text-xs text-gray-400 mb-1">
                            {t("Transcription type")}
                        </h5>
                        <TranscriptionTypeSelector
                            loading={loading}
                            wordTimestamped={wordTimestamped}
                            maxLineWidth={maxLineWidth}
                            handleTranscriptionTypeChange={
                                handleTranscriptionTypeChange
                            }
                        />
                    </div>
                )}

                <div className="flex flex-col">
                    <h5 className="font-semibold text-xs text-gray-400 mb-1">
                        {t("Language")}
                    </h5>
                    <LanguageSelector
                        language={language}
                        setLanguage={setLanguage}
                        loading={loading}
                        debouncedUpdateUserState={debouncedUpdateUserState}
                    />
                </div>
            </div>

            {error && (
                <div className="text-red-500 text-sm mb-2">
                    {t("Error")}: {error.message}
                </div>
            )}

            <div className="">
                <LoadingButton
                    className="mb-2.5 lb-primary"
                    disabled={!url}
                    loading={loading}
                    text={t(currentOperation)}
                    onClick={() => handleSubmit()}
                >
                    <FaVideo className="text-lg" /> {t("Transcribe")}
                </LoadingButton>
            </div>
        </>
    );
}

function FormatSelector({ loading, responseFormat, handleFormatChange }) {
    const { t } = useTranslation();

    return (
        <select
            disabled={loading}
            className="lb-select"
            value={responseFormat || ""}
            onChange={handleFormatChange}
        >
            <option value="">{t("Plain Text transcript")}</option>
            <option value="formatted">{t("Formatted Transcript")}</option>
            <option value="vtt">{t("Subtitles")}</option>
        </select>
    );
}

function ModelSelector({
    loading,
    selectedModelOption,
    setSelectedModelOption,
    neuralspaceEnabled,
}) {
    return (
        <select
            className="lb-select ml-2 w-auto flex-shrink-0"
            disabled={loading}
            value={selectedModelOption}
            onChange={(e) => setSelectedModelOption(e.target.value)}
        >
            <option value="Whisper">Whisper</option>
            <option value="Gemini">Gemini</option>
            {neuralspaceEnabled && (
                <option value="NeuralSpace">NeuralSpace</option>
            )}
        </select>
    );
}

function TranscriptionTypeSelector({
    loading,
    wordTimestamped,
    maxLineWidth,
    handleTranscriptionTypeChange,
}) {
    const { t } = useTranslation();

    return (
        <select
            disabled={loading}
            className="lb-select"
            value={
                !wordTimestamped && !maxLineWidth
                    ? "phraseLevel"
                    : wordTimestamped && !maxLineWidth
                      ? "wordLevel"
                      : maxLineWidth === 35
                        ? "horizontal"
                        : maxLineWidth === 25
                          ? "vertical"
                          : ""
            }
            onChange={handleTranscriptionTypeChange}
        >
            <option value="phraseLevel">{t("Phrase level")}</option>
            <option value="wordLevel">{t("Word level")}</option>
            <option value="horizontal">{t("Horizontal")}</option>
            <option value="vertical">{t("Vertical")}</option>
        </select>
    );
}

function LanguageSelector({
    language,
    setLanguage,
    loading,
    debouncedUpdateUserState,
}) {
    const { t } = useTranslation();

    return (
        <select
            className="lb-select text-sm"
            disabled={loading}
            onChange={(event) => {
                setLanguage(event.target.value);
                debouncedUpdateUserState((prev) => ({
                    ...prev,
                    language: event.target.value,
                }));
            }}
            value={language}
        >
            <option value="">{t("Auto-detect video language")}</option>
            <option value="en">{t("English")}</option>
            <option value="ar">{t("Arabic")}</option>
            <option value="fr">{t("French")}</option>
            <option value="es">{t("Spanish")}</option>
            <option value="de">{t("German")}</option>
            <option value="he">{t("Hebrew")}</option>
            <option value="it">{t("Italian")}</option>
            <option value="pt">{t("Portuguese")}</option>
            <option value="zh">{t("Chinese")}</option>
            <option value="ja">{t("Japanese")}</option>
            <option value="ko">{t("Korean")}</option>
            <option value="bs">{t("Bosnian")}</option>
            <option value="hr">{t("Croatian")}</option>
            <option value="sr">{t("Serbian")}</option>
            <option value="ru">{t("Russian")}</option>
            <option value="tr">{t("Turkish")}</option>
        </select>
    );
}
