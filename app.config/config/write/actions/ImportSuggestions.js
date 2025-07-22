"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { stripHTML } from "../../../../src/utils/html.utils";

function getPosts(site, query) {
    return fetch(
        `https://wordpress.${site}.aj-harbinger.com/wp-json/wp/v2/posts?search=${query}&per_page=100`,
        {
            method: "GET",
            mode: "cors",
        },
    )
        .then((response) => response.json())
        .then((response) => {
            return response;
        });
}

function getThumbnails(site, posts) {
    return Promise.all(
        posts.map((post) => getThumbnail(site, post.featured_media, post.id)),
    );
}

function getThumbnail(site, mediaId, postId) {
    return fetch(
        `https://wordpress.${site}.aj-harbinger.com/wp-json/wp/v2/media/${mediaId}`,
        {
            method: "GET",
            mode: "cors",
        },
    )
        .then((response) => response.json())
        .then((response) => ({
            mediaId,
            postId,
            url: response?.media_details?.sizes?.thumbnail?.source_url,
        }));
}

export function ImportSuggestions({ text, onSelect, diffEditorRef }) {
    const [query, setQuery] = useState("");
    const [posts, setPosts] = useState([]);
    const [thumbnails, setThumbnails] = useState({});
    const [error, setError] = useState(null);
    const [storyFlow, setStoryFlow] = useState("aja");
    const [loading, setLoading] = useState(true);
    const [selectedPost, setSelectedPost] = useState(null);
    const { t } = useTranslation();

    const timeoutRef = useRef(null);
    const storyFlowRef = useRef(null);
    storyFlowRef.current = storyFlow;

    useEffect(() => {
        setPosts([]);
        setSelectedPost(null);
        clearTimeout(timeoutRef.current);
    }, [storyFlow]);

    useEffect(() => {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(
            () => {
                setLoading(true);
                setError(false);
                getPosts(storyFlow, query)
                    .then((posts) => {
                        setLoading(false);

                        if (storyFlowRef.current === storyFlow) {
                            setPosts(posts);
                            getThumbnails(
                                storyFlow,
                                posts.map((p) => p),
                            ).then((thumbnails) => {
                                const newThumbnails = {};
                                for (const thumbnail of thumbnails) {
                                    newThumbnails[thumbnail.postId] =
                                        thumbnail.url;
                                }
                                setThumbnails(newThumbnails);
                            });
                        }
                    })
                    .catch((err) => {
                        setLoading(false);
                        setError(err);
                    });
            },
            query ? 1000 : 0,
        );
    }, [storyFlow, query]);

    const selectPost = (postId) => {
        const post = posts.find((p) => p.id === parseInt(postId));
        const text = stripHTML(post.content.rendered);
        onSelect(text, storyFlow === "aja" ? "rtl" : "ltr");
        setSelectedPost(postId);
    };

    return (
        <div>
            <ToggleGroup
                type="single"
                value={storyFlow}
                onValueChange={(value) => {
                    if (!value) {
                        return;
                    }
                    setStoryFlow(value);
                }}
                className="mb-4 flex"
            >
                <ToggleGroupItem value="aja">{t("AJA")}</ToggleGroupItem>
                <ToggleGroupItem value="aje">{t("AJE")}</ToggleGroupItem>
                <ToggleGroupItem value="ajb">{t("AJ Balkans")}</ToggleGroupItem>
                <ToggleGroupItem value="chinese">
                    {t("AJ Chinese")}
                </ToggleGroupItem>
            </ToggleGroup>
            {error && (
                <div className="mt-2 text-red-700 dark:text-red-400 p-4 rounded bg-red-50 dark:bg-red-900/20">
                    {t(
                        "Unable to connect to the UCMS. Please make sure that you're connected to the VPN. The error received was:",
                    )}{" "}
                    {error.toString()}
                </div>
            )}
            {!error && (
                <div className="mt-4">
                    <input
                        className="lb-input w-full"
                        type="search"
                        placeholder={t("Search")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
            )}
            <div
                className={`h-[calc(100vh-400px)] min-h-[200px] mt-4 overflow-y-auto ${storyFlow === "aja" ? "rtl" : "ltr"}`}
            >
                {loading && (
                    <div className="flex justify-center pt-12">
                        <Loader2Icon className="animate-spin text-sky-600" />
                    </div>
                )}
                {!loading && (
                    <ul className="list-none ps-0 pt-2">
                        <form
                            onChange={(e) => {
                                const postId = e.target.id.split("-")[1];
                                selectPost(postId);
                            }}
                        >
                            {posts.map((post, i) => (
                                <li
                                    className={`rounded-md border p-4 mb-3 ${parseInt(selectedPost) === post.id ? "bg-sky-50 dark:bg-sky-900/20" : ""}`}
                                    key={`post-${post.id}`}
                                >
                                    <div
                                        className="flex flex-col sm:flex-row gap-2 sm:gap-3 cursor-pointer"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            selectPost(post.id);
                                        }}
                                    >
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="radio"
                                                className="lb-radio"
                                                checked={
                                                    parseInt(selectedPost) ===
                                                    parseInt(post.id)
                                                }
                                                onChange={() => {}}
                                                name="post-radio"
                                                id={`post-${post.id}`}
                                            />
                                            <span className="sm:hidden">
                                                {t("Tap here to select")}
                                            </span>
                                        </div>
                                        <div className="w-full sm:w-[150px] sm:shrink-0">
                                            {thumbnails[parseInt(post.id)] && (
                                                <img
                                                    alt={post.title.rendered}
                                                    className="rounded w-full"
                                                    src={`https://${storyFlow}.aj-harbinger.com${thumbnails[parseInt(post.id)]}`}
                                                />
                                            )}
                                        </div>
                                        <div className="grow">
                                            <div
                                                className="font-bold text-lg mb-1"
                                                style={{
                                                    fontFamily:
                                                        storyFlow === "aja"
                                                            ? "auto"
                                                            : "",
                                                }}
                                            >
                                                {post.title.rendered}
                                            </div>
                                            <div className="text-sm">
                                                <div
                                                    style={{
                                                        fontFamily:
                                                            storyFlow === "aja"
                                                                ? "auto"
                                                                : "",
                                                    }}
                                                >
                                                    <div className="text-gray-600">
                                                        <span className="font-sans">
                                                            {
                                                                post.date_gmt.split(
                                                                    "T",
                                                                )[0]
                                                            }
                                                        </span>{" "}
                                                        -{" "}
                                                        {post.excerpt.rendered}
                                                    </div>
                                                </div>
                                                <div className="mt-1 text-xs">
                                                    <a
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-sky-600"
                                                        href={`https://${storyFlow}.aj-harbinger.com${post.link}`}
                                                    >
                                                        {t("View on site")}
                                                    </a>{" "}
                                                    |{" "}
                                                    <a
                                                        href={`https://wordpress.${storyFlow}.aj-harbinger.com/wp-admin/post.php?post=${post.id}`}
                                                        rel="noreferrer"
                                                        target="_blank"
                                                        className="text-sky-600"
                                                    >
                                                        {t("View in UCMS")}
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </form>
                    </ul>
                )}
            </div>
        </div>
    );
}
