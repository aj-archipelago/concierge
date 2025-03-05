import { useQuery } from "@tanstack/react-query";
import { CheckIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import config from "../../../config";
import LoadingButton from "../editor/LoadingButton";

const VideoSelector = ({ url, onSelect, onClose }) => {
    const [debouncedUrl, setDebouncedUrl] = useState(url);
    const [searchInput, setSearchInput] = useState(url);
    const fetchUrlSource = config?.transcribe?.fetchUrlSource;
    const { t } = useTranslation();

    const handleSearch = () => {
        setDebouncedUrl(searchInput);
    };

    const { data, error, isLoading } = useQuery({
        queryKey: ["urlsource", debouncedUrl],
        queryFn: async () => {
            return await fetchUrlSource(debouncedUrl);
        },
        enabled: !!debouncedUrl && !!fetchUrlSource,
    });

    useEffect(() => {
        if (
            data?.results?.length === 1 &&
            data?.results[0]?.fromExternalChannel
        ) {
            onSelect({
                videoUrl: ensureHttps(data?.results[0]?.videoUrl),
                transcriptionUrl: ensureHttps(data?.results[0]?.url),
            });
        }
    }, [data, onSelect]);

    const ensureHttps = (url) => {
        if (url?.startsWith("http://")) {
            return url.replace("http://", "https://");
        }
        return url;
    };

    if (!fetchUrlSource) return null;

    return (
        <div className="mb-4 min-h-[300px] p-4 border relative rounded-md">
            <button
                onClick={onClose}
                className="absolute top-2 right-2 p-2 hover:bg-gray-100 rounded-full"
                aria-label="Close"
            >
                <XIcon className="w-4 h-4" />
            </button>
            <div className="mb-1">
                <label htmlFor="url-input" className="font-semibold">
                    {t("Search the AJ library by video URL or title")}
                </label>
            </div>
            <div className="flex gap-2">
                <div className="grow">
                    <input
                        id="url-input"
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleSearch();
                            }
                        }}
                        className="lb-input"
                        placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ or 'Inside story...'"
                    />
                </div>
                <div>
                    <LoadingButton
                        onClick={handleSearch}
                        className="lb-primary flex items-center gap-2"
                        loading={isLoading}
                        disabled={isLoading || !searchInput}
                        text={isLoading ? t("Searching...") : t("Search")}
                    >
                        <SearchIcon className="w-4 h-4" />
                        {isLoading ? t("Searching...") : t("Search")}
                    </LoadingButton>
                </div>
            </div>

            {isLoading ? null : error ? (
                <p className="mt-4">
                    Error: {t(error.message) || JSON.stringify(error)}
                </p>
            ) : data?.results?.length > 0 ? (
                <div className="bg-gray-100 p-4 rounded-sm text-md mt-4 max-h-[350px] overflow-auto">
                    <h6 className="font-bold mb-2">
                        {t("Found {{count}} potential matches:", {
                            count: data.results.length,
                        })}
                    </h6>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.results.map((result, index) => (
                            <div
                                key={index}
                                className="bg-white rounded-lg shadow-sm p-4"
                            >
                                <p className="text-gray-700 font-semibold mb-1 truncate">
                                    {result.name}
                                </p>
                                <p className="text-gray-500 text-sm mb-2">
                                    {t("Match confidence:")}{" "}
                                    {Math.round(result.similarity * 100)}%
                                </p>
                                {result.isYouTube ? (
                                    <iframe
                                        className="w-full aspect-video mb-4 rounded"
                                        src={result.videoUrl}
                                        allowFullScreen
                                        title="YouTube video player"
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    />
                                ) : (
                                    <video
                                        className="w-full aspect-video object-cover mb-4 rounded"
                                        controls
                                        src={result.videoUrl || result.url}
                                    />
                                )}
                                <div className="flex justify-center gap-2 text-xs">
                                    <button
                                        className="lb-success"
                                        onClick={() => {
                                            onSelect({
                                                videoUrl: ensureHttps(
                                                    result.videoUrl,
                                                ),
                                                transcriptionUrl: ensureHttps(
                                                    result.url,
                                                ),
                                            });
                                        }}
                                    >
                                        <CheckIcon className="w-4 h-4" />
                                        {t("Use this video")}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : data?.results ? (
                <p className="mt-4 text-gray-600">
                    {t("No matching videos found")}
                </p>
            ) : data?.error ? (
                <p className="mt-4">{data.error}</p>
            ) : null}
        </div>
    );
};

export default VideoSelector;
