import PropTypes from "prop-types";
import React, { useEffect, useState, useCallback } from "react";

import i18n from "../../../../src/i18n";
import HighlightKeywords from "./HighlightKeywords";
import RenderArticles from "./RenderArticles";

const isRTL = (text) => {
    const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlChars.test(text);
};

const InternalLinksDiff = ({
    string1 = "",
    keywords = [],
    setSelectedText,
}) => {
    const [content, setContent] = useState(string1);
    const [topArticles, setTopArticles] = useState([]);
    const [addedLinks, setAddedLinks] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedKeyword, setSelectedKeyword] = useState(null);
    const [searchInput, setSearchInput] = useState("");
    const [isCopied, setIsCopied] = useState(false);
    const [copyableText, setCopyableText] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [contentTypes, setContentTypes] = useState([]);
    const [selectedContentType, setSelectedContentType] = useState("");

    // Constants for default parameter values
    const defaultSearch = "";
    const defaultContentType = "";
    const defaultKeyword = "";

    const CopyableText = ({ text }) => {
        const isDefault = text === "";
        const defaultText = i18n.t("Selected Link");
        const decodedText = isDefault ? defaultText : decodeURIComponent(text);

        return (
            <div className="copy-link-container">
                <div className={`copy-link ${isDefault ? "default" : ""}`}>
                    {isDefault ? defaultText : decodedText}
                </div>
                <div
                    className="copy-icon"
                    onClick={() =>
                        copyText(isDefault ? defaultText : decodedText)
                    }
                >
                    <span className="dashicon">
                        {isCopied ? "\u2714" : "\u2398"}
                    </span>
                </div>
            </div>
        );
    };

    const copyText = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    const fetchContentTypes = useCallback(() => {
        const data = new FormData();
        data.append("action", "get_content_types");
        data.append("post_id", window?.arcCMB2HelperData?.post_id);

        fetch(window?.ajaxurl, {
            method: "POST",
            credentials: "same-origin",
            body: data,
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                if (!data || !data.success) {
                    throw new Error("Invalid data received from server");
                }
                setContentTypes(data.data || []);
            })
            .catch((error) => {
                console.error("Error fetching content types:", error);
                setContentTypes([]);
            });
    }, []);

    const fetchTopArticles = useCallback(
        (keyword = "", search = "", contentType = "") => {
            setIsLoading(true);
            setErrorMessage("");
            const data = new FormData();
            data.append("action", "get_internal_links_articles");
            data.append("keyword", keyword);
            data.append("search", search);
            data.append("content_type", contentType);
            data.append("post_id", window?.arcCMB2HelperData?.post_id);

            fetch(window?.ajaxurl, {
                method: "POST",
                credentials: "same-origin",
                body: data,
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(
                            `HTTP error! status: ${response.status}`,
                        );
                    }
                    return response.json();
                })
                .then((data) => {
                    if (!data || !data.success || !Array.isArray(data.data)) {
                        throw new Error("Invalid data received from server");
                    }
                    setTopArticles(data.data);
                    setIsLoading(false);
                })
                .catch((error) => {
                    console.error("Error fetching articles:", error);
                    setTopArticles([]);
                    setIsLoading(false);
                    // You can add a state to show an error message to the user
                    setErrorMessage(
                        i18n.t("Failed to fetch articles. Please try again."),
                    );
                });
        },
        [],
    );

    useEffect(() => {
        fetchContentTypes();
    }, [fetchContentTypes]);

    useEffect(() => {
        if (!string1 || keywords.length === 0) {
            return;
        }

        const cleanedContent = string1.replace(/&nbsp;/g, " ").trim();
        setContent(cleanedContent);

        // Function to escape special characters in regex
        const escapeRegExp = (string) => {
            return string.replace(/[-/\\^$*+?.()|[$${}]/g, "\\$&");
        };

        // Find the first keyword that exists in the content
        const foundKeyword = keywords.find((keyword) => {
            const escapedKeyword = escapeRegExp(keyword);
            // Use Unicode word boundaries for better multilingual support
            const regex = new RegExp(
                `(?<=^|[^\\p{L}\\p{N}])(${escapedKeyword})(?=[^\\p{L}\\p{N}]|$)`,
                "iu",
            );
            return regex.test(cleanedContent);
        });

        if (foundKeyword) {
            setSelectedKeyword(foundKeyword);
            fetchTopArticles(foundKeyword, defaultSearch, defaultContentType);
        } else {
            setSelectedKeyword(null);
            fetchTopArticles(defaultKeyword, defaultSearch, defaultContentType);
        }
    }, [string1, keywords, fetchTopArticles]);

    const updateContentWithLink = useCallback((text, link) => {
        const escapedKeyword = link.keyword.replace(
            /[-/\\^$*+?.()|[$${}]/g,
            "\\$&",
        );

        const regex = new RegExp(
            `(?<=\\s|^)(${escapedKeyword}|<a href="[^"]*" class="highlight-link" data-post-id="[^"]*">${escapedKeyword}</a>)(?=\\s|$)`,
            "g",
        );

        const anchorElement = document.createElement("a");
        Object.assign(anchorElement, {
            href: link.url,
            className: "highlight-link",
        });
        anchorElement.dataset.postId = link.postId;
        anchorElement.textContent = link.keyword;

        return text.replace(regex, anchorElement.outerHTML);
    }, []);

    const handleHighlightClick = useCallback(
        (event) => {
            event.preventDefault();
            const clickedHighlight = event.target.closest(".highlight");
            if (clickedHighlight) {
                event.stopPropagation();
                const keyword = clickedHighlight.textContent;
                setSelectedKeyword((prevKeyword) =>
                    prevKeyword === keyword ? null : keyword,
                );
                setSearchInput(""); // Clear the search input
                setSelectedContentType(""); // Reset content type dropdown to default
                fetchTopArticles(keyword, defaultSearch, defaultContentType); // Fetch articles for the clicked keyword with empty search and content type
            }
        },
        [fetchTopArticles],
    );

    const handleArticleClick = useCallback(
        (event) => {
            if (event.target.type === "radio") return;

            const clickedElement = event.target.closest(".article-item");
            if (!clickedElement) return;

            const radio = clickedElement.querySelector('input[type="radio"]');
            if (!radio) return;

            const isCurrentlySelected = radio.checked;

            document.querySelectorAll(".article-item").forEach((el) => {
                el.classList.remove("selected");
                const elRadio = el.querySelector('input[type="radio"]');
                if (elRadio) {
                    elRadio.checked = false;
                }
            });

            if (!isCurrentlySelected) {
                clickedElement.classList.add("selected");
                radio.checked = true;

                const postId = clickedElement.dataset.postId;
                if (selectedKeyword) {
                    event.preventDefault();
                    event.stopPropagation();
                    const articleLinkElement =
                        clickedElement.querySelector(".article-link");
                    const articleUrl = articleLinkElement?.href;

                    const newLink = {
                        keyword: selectedKeyword,
                        url: articleUrl,
                        postId,
                    };

                    setAddedLinks((prevLinks) => [...prevLinks, newLink]);

                    const updatedContent = updateContentWithLink(
                        content,
                        newLink,
                    );
                    setContent(updatedContent);

                    if (
                        setSelectedText &&
                        typeof setSelectedText === "function"
                    ) {
                        setSelectedText(updatedContent);
                    }

                    setCopyableText(articleUrl);
                }
            }
        },
        [selectedKeyword, content, setSelectedText, updateContentWithLink],
    );

    const handleSearchInputChange = (event) => {
        setSearchInput(event.target.value);
    };

    const handleSearchSubmit = (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            fetchTopArticles(selectedKeyword, searchInput, selectedContentType);
        }
    };

    const handleContentTypeChange = (event) => {
        const newContentType = event.target.value;
        setSelectedContentType(newContentType);
        fetchTopArticles(selectedKeyword, searchInput, newContentType);
    };

    // function to handle custom text selection from article content.
    const handleTextSelect = useCallback(
        (selectedText) => {
            // Check if the selected text is already in the keywords list.
            if (!keywords.includes(selectedText)) {
                // Add the selected text to keywords.
                const updatedKeywords = [...keywords, selectedText];

                if (setSelectedText && typeof setSelectedText === "function") {
                    setSelectedText(updatedKeywords);
                }

                // Set the newly selected text as the selectedKeyword and reset the content type and search input.
                setSelectedKeyword(selectedText);
                setSelectedContentType(defaultContentType);
                setSearchInput(defaultSearch);
                fetchTopArticles(
                    selectedText,
                    defaultSearch,
                    defaultContentType,
                );
            }
        },
        [keywords, fetchTopArticles, setSelectedText],
    );

    const contentDir = isRTL(content) ? "rtl" : "ltr";

    return (
        <div className="ai-diff" style={{ gap: 10 }}>
            <div className="internal-link-header">
                <div style={{ flexBasis: 500 }}>
                    {" "}
                    {i18n.t("Text")}{" "}
                    <span>
                        (
                        {i18n.t(
                            "AI Identified Potential Keywords for Internal Links",
                        )}
                        )
                    </span>
                </div>
                <div style={{ flex: 1 }}>
                    {i18n.t("Suggested articles for")}{" "}
                    <span>{selectedKeyword}</span>
                </div>
            </div>
            <div className="change-container">
                <div
                    className="internal-link-article"
                    onClick={handleHighlightClick}
                >
                    <div dir={contentDir} id="ai-change-preview">
                        <HighlightKeywords
                            content={content}
                            keywords={keywords}
                            addedLinks={addedLinks}
                            selectedKeyword={selectedKeyword}
                            onTextSelect={handleTextSelect}
                        />
                    </div>
                </div>
                <div className="internal-link-suggestions">
                    <div className="article-search-filter-container">
                        <input
                            type="text"
                            placeholder={i18n.t("Search articles")}
                            value={searchInput}
                            onChange={handleSearchInputChange}
                            onKeyDown={handleSearchSubmit}
                            className="article-search-input"
                        />
                        <select
                            value={selectedContentType}
                            onChange={handleContentTypeChange}
                            className="article-search-dropdown"
                            aria-label={i18n.t("Filter by content type")}
                        >
                            <option value="">
                                {i18n.t("All Content Types")}
                            </option>
                            {contentTypes.map((contentType) => (
                                <option
                                    key={contentType.id}
                                    value={contentType.id}
                                >
                                    {contentType.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {isLoading ? (
                        <div className="loader">
                            <p>{i18n.t("Loading New Articles")}</p>
                            <div className="article-spinner"></div>
                        </div>
                    ) : errorMessage ? (
                        <div className="error-message">{errorMessage}</div>
                    ) : (
                        <div className="result-container">
                            <div
                                className="articles-container"
                                onClick={handleArticleClick}
                            >
                                {RenderArticles(topArticles)}
                            </div>
                            <div className="copy-article-link">
                                <CopyableText text={copyableText} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

InternalLinksDiff.propTypes = {
    string1: PropTypes.string,
    keywords: PropTypes.array,
    setSelectedText: PropTypes.func,
};

export default InternalLinksDiff;
