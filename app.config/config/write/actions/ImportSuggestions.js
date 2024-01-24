"use client";

import { ButtonGroup, Form, Spinner, ToggleButton } from "react-bootstrap";
import { useEffect, useState, useRef } from "react";
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
            <ButtonGroup style={{ width: "50%" }}>
                <ToggleButton
                    size="sm"
                    key={`radio-selector-${"aja"}`}
                    id={`radio-selector-${"aja"}`}
                    type="radio"
                    variant={"outline-secondary"}
                    name="radio"
                    value={"aja"}
                    checked={storyFlow === "aja"}
                    onChange={(e) => {
                        setStoryFlow("aja");
                    }}
                >
                    {t("AJA")}
                </ToggleButton>
                <ToggleButton
                    size="sm"
                    key={`radio-selector-${"aje"}`}
                    id={`radio-selector-${"aje"}`}
                    type="radio"
                    variant={"outline-secondary"}
                    name="radio"
                    value={"aje"}
                    checked={storyFlow === "aje"}
                    onChange={(e) => {
                        setStoryFlow("aje");
                    }}
                >
                    {t("AJE")}
                </ToggleButton>
                <ToggleButton
                    key={`radio-selector-${"ajb"}`}
                    id={`radio-selector-${"ajb"}`}
                    type="radio"
                    size="sm"
                    variant={"outline-secondary"}
                    name="radio"
                    value={"ajb"}
                    checked={storyFlow === "ajb"}
                    onChange={(e) => {
                        setStoryFlow("ajb");
                    }}
                >
                    {t("AJ Balkans")}
                </ToggleButton>
                <ToggleButton
                    key={`radio-selector-${"chinese"}`}
                    id={`radio-selector-${"chinese"}`}
                    type="radio"
                    size="sm"
                    variant={"outline-secondary"}
                    name="radio"
                    value={"chinese"}
                    checked={storyFlow === "chinese"}
                    onChange={(e) => {
                        setStoryFlow("chinese");
                    }}
                >
                    {t("AJ Chinese")}
                </ToggleButton>
            </ButtonGroup>
            {error && (
                <div className="mt-2">
                    {t("Error retrieving data")}: {error.toString()}
                </div>
            )}
            <div style={{ marginTop: 20 }}>
                <Form.Control
                    size="sm"
                    type="search"
                    placeholder={t("Search")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>
            <div
                style={{
                    paddingInlineStart: 10,
                    marginTop: 20,
                    minHeight: 200,
                    height: "calc(100% - 120px)",
                    overflowY: "auto",
                    direction: storyFlow === "aja" ? "rtl" : "ltr",
                }}
            >
                {loading && (
                    <div
                        style={{
                            display: "flex",
                            paddingTop: 50,
                            justifyContent: "center",
                        }}
                    >
                        <Spinner
                            size="lg"
                            variant="primary"
                            animation="border"
                        />
                    </div>
                )}
                {!loading && (
                    <ul
                        style={{
                            paddingInlineStart: 0,
                            listStyleType: "none",
                            paddingLeft: 0,
                            paddingTop: 10,
                        }}
                    >
                        <Form
                            onChange={(e) => {
                                const postId = e.target.id.split("-")[1];
                                selectPost(postId);
                            }}
                        >
                            {posts.map((post, i) => (
                                <li
                                    className={`importable-story mb-3 ${parseInt(selectedPost) === post.id ? "active" : ""}`}
                                    key={`post-${post.id}`}
                                >
                                    <div style={{ display: "flex" }}>
                                        <div style={{ marginInlineEnd: 10 }}>
                                            <Form.Check
                                                type={"radio"}
                                                checked={
                                                    parseInt(selectedPost) ===
                                                    parseInt(post.id)
                                                }
                                                onChange={() => {}}
                                                name={`post-radio`}
                                                id={`post-${post.id}`}
                                            />
                                        </div>
                                        <div
                                            style={{
                                                flexBasis: "150px",
                                                marginInlineEnd: 10,
                                                padding: "4px 0",
                                            }}
                                        >
                                            {thumbnails[parseInt(post.id)] && (
                                                <img
                                                    alt={post.title.rendered}
                                                    style={{ borderRadius: 5 }}
                                                    src={`https://${storyFlow}.aj-harbinger.com${thumbnails[parseInt(post.id)]}`}
                                                />
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                flex: 1,
                                                cursor: "pointer",
                                            }}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                selectPost(post.id);
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontWeight: "bold",
                                                    marginBottom: 0,
                                                    fontSize: 16,
                                                    fontFamily:
                                                        storyFlow === "aja"
                                                            ? "auto"
                                                            : "",
                                                }}
                                            >
                                                {post.title.rendered}
                                            </div>
                                            <div style={{ fontSize: 15 }}>
                                                <div
                                                    style={{
                                                        fontFamily:
                                                            storyFlow === "aja"
                                                                ? "auto"
                                                                : "",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            color: "#999",
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontFamily:
                                                                    "Arial",
                                                            }}
                                                        >
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
                                                <div
                                                    style={{
                                                        fontSize: 14,
                                                        marginTop: 2,
                                                    }}
                                                >
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
                                                        View in UCMS
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </Form>
                    </ul>
                )}
            </div>
        </div>
    );
}
