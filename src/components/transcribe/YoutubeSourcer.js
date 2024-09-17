import React from "react";
import { useQuery } from "@tanstack/react-query";

const isValidYoutubeUrl = (url) => {
    const youtubeRegex =
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return youtubeRegex.test(url);
};

const fetchYoutubeData = async (url) => {
    const response = await fetch(
        `/api/youtube?youtubeInput=${encodeURIComponent(url)}`,
    );
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
};

const YoutubeSourcer = ({ url, setUrl }) => {
    const isYoutubeUrl = isValidYoutubeUrl(url);

    const { data, error, isLoading } = useQuery({
        queryKey: ["youtubeData", url],
        queryFn: () => fetchYoutubeData(url),
        enabled: !!url && isYoutubeUrl,
    });

    if (!isYoutubeUrl) return null;
    if (isLoading) return; //<p className="text-gray-300">Checking if video is in AJ sources...</p>;
    if (error) return <p>Error: {error.message || JSON.stringify(error)}</p>;
    if (data)
        return (
            <div className="bg-gray-100 p-4 rounded-sm text-md">
                <h3 className="font-bold">
                    Suggested Transcription URL Found!
                </h3>
                <p className="text-gray-700">{data.name}</p>
                <video
                    className="w-full mb-4 rounded"
                    controls
                    src={data.videoUrl || data.url}
                />
                <div className="flex justify-center gap-2 text-xs">
                    <button
                        className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-300 flex items-center"
                        onClick={() => setUrl(data.url)}
                    >
                        <svg
                            className="w-4 h-4 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                        Use this URL for transcription?
                    </button>
                    <button
                        className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-300 flex items-center"
                        onClick={() => setUrl("")}
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        );
    return null;
};

export default YoutubeSourcer;
