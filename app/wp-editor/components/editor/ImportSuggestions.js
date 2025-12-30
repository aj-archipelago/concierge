import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEffect, useRef, useState } from "react";
import i18n from "../../../../src/i18n";

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

export default function ImportSuggestions({ text, onSelect, diffEditorRef }) {
    const [query, setQuery] = useState("");
    const [posts, setPosts] = useState([]);
    const [thumbnails, setThumbnails] = useState({});
    const [error, setError] = useState(null);
    const [storyFlow, setStoryFlow] = useState("aja");
    const [loading, setLoading] = useState(true);
    const [selectedPost, setSelectedPost] = useState(null);

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
                setError(null);
                setLoading(true);
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
        var temp = document.createElement("div");
        temp.innerHTML = post.content.rendered;
        const text = temp.textContent
            .split("\n")
            .filter((paragraph) => paragraph.trim().length > 0)
            .join("\n\n");
        onSelect(text, storyFlow === "aja" ? "rtl" : "ltr");
        setSelectedPost(postId);
    };

    return (
        <div>
            <ToggleGroup
                type="single"
                value={storyFlow}
                onValueChange={(value) => value && setStoryFlow(value)}
                className="w-1/2"
            >
                <ToggleGroupItem value="aja" size="sm" variant="outline">
                    AJA
                </ToggleGroupItem>
                <ToggleGroupItem value="aje" size="sm" variant="outline">
                    AJE
                </ToggleGroupItem>
                <ToggleGroupItem value="ajb" size="sm" variant="outline">
                    Balkans
                </ToggleGroupItem>
                <ToggleGroupItem value="chinese" size="sm" variant="outline">
                    Chinese
                </ToggleGroupItem>
            </ToggleGroup>
            {error && (
                <p>
                    {i18n.t("Error retrieving data:")} {error.toString()}
                </p>
            )}
            <div className="mt-5">
                <Input
                    type="search"
                    placeholder="Search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>
            <div
                className="ps-2 mt-5 min-h-[200px] overflow-y-scroll"
                style={{
                    height: "calc(100vh - 430px)",
                    direction: storyFlow === "aja" ? "rtl" : "ltr",
                }}
            >
                {loading && (
                    <div className="flex pt-12 justify-center">
                        <Spinner size="lg" />
                    </div>
                )}
                {!loading && (
                    <ul className="ps-0 list-none pl-0 pt-2">
                        <div
                            onChange={(e) => {
                                const postId = e.target.id.split("-")[1];
                                selectPost(postId);
                            }}
                        >
                            {posts.map((post, i) => (
                                <li
                                    className="mb-3 border border-gray-300 p-2 me-2"
                                    style={{
                                        backgroundColor:
                                            parseInt(selectedPost) ===
                                            parseInt(post.id)
                                                ? "#fee8b7"
                                                : "#fff",
                                    }}
                                    key={`post-${post.id}`}
                                >
                                    <div className="flex justify-between">
                                        <div className="me-2">
                                            <input
                                                type="radio"
                                                checked={
                                                    parseInt(selectedPost) ===
                                                    parseInt(post.id)
                                                }
                                                name="post-radio"
                                                id={`post-${post.id}`}
                                                className="h-4 w-4"
                                            />
                                        </div>
                                        <div className="flex-1 me-2 py-1 w-36">
                                            {thumbnails[parseInt(post.id)] && (
                                                <img
                                                    alt={post.title.rendered}
                                                    className="rounded"
                                                    src={`https://${storyFlow}.aj-harbinger.com${thumbnails[parseInt(post.id)]}`}
                                                />
                                            )}
                                        </div>
                                        <div>
                                            <div
                                                className="font-bold mb-0 text-base"
                                                style={{
                                                    fontFamily:
                                                        storyFlow === "aja"
                                                            ? "auto"
                                                            : "",
                                                }}
                                            >
                                                <a
                                                    style={{
                                                        textDecoration: "none",
                                                        color: "inherit",
                                                    }}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    href={"!#"}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        selectPost(post.id);
                                                    }}
                                                >
                                                    {post.title.rendered}
                                                </a>
                                            </div>
                                            <div className="text-[15px]">
                                                <div
                                                    style={{
                                                        fontFamily:
                                                            storyFlow === "aja"
                                                                ? "auto"
                                                                : "",
                                                    }}
                                                >
                                                    <div className="text-gray-500">
                                                        <span className="font-arial">
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
                                                <div className="text-sm mt-0.5">
                                                    <a
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        href={`https://${storyFlow}.aj-harbinger.com${post.link}`}
                                                    >
                                                        View on site
                                                    </a>{" "}
                                                    |{" "}
                                                    <a
                                                        href={`https://wordpress.${storyFlow}.aj-harbinger.com/wp-admin/post.php?post=${post.id}`}
                                                        rel="noreferrer"
                                                        target="_blank"
                                                    >
                                                        {i18n.t("View in UCMS")}
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </div>
                    </ul>
                )}
            </div>
        </div>
    );
}
