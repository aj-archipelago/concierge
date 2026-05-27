"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { getDOMPurifyConfig } from "../../utils/html.utils";

/**
 * StoryPreview component - renders article/story preview similar to Write page preview tab
 *
 * SECURITY NOTE: This component sanitizes HTML content using DOMPurify before rendering
 * to prevent XSS attacks. The content is expected to come from trusted sources (user's own
 * article content), but sanitization provides defense-in-depth.
 *
 * @param {Object} props
 * @param {string} props.headline - The article headline
 * @param {string} props.subhead - The article subhead
 * @param {string} props.content - The HTML content of the article
 * @param {string} props.featuredImageUrl - URL of the featured image
 */
export default function StoryPreview({
    headline,
    subhead,
    content,
    featuredImageUrl,
}) {
    const { t } = useTranslation();

    // Sanitize HTML content before rendering to prevent XSS attacks
    const sanitizedContent = content
        ? DOMPurify.sanitize(content, getDOMPurifyConfig())
        : null;
    return (
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-auto h-full">
            <article className="max-w-4xl mx-auto p-6">
                <div className="mb-4">
                    {/* Headline */}
                    {headline && (
                        <div className="mb-3">
                            <h1
                                className="text-4xl w-full bg-transparent text-gray-900 dark:text-gray-100 mb-3"
                                style={{
                                    fontFamily: "Roboto, sans-serif",
                                    fontWeight: "700",
                                    border: "none",
                                    padding: 0,
                                    margin: 0,
                                    outline: "none",
                                    boxShadow: "none",
                                }}
                            >
                                {headline}
                            </h1>
                        </div>
                    )}

                    {/* Subhead */}
                    {subhead && (
                        <div>
                            <h2
                                className="text-xl w-full bg-transparent text-gray-500 dark:text-gray-300"
                                style={{
                                    fontFamily: "Georgia, serif",
                                    fontStyle: "italic",
                                    border: "none",
                                    padding: 0,
                                    margin: 0,
                                    outline: "none",
                                    boxShadow: "none",
                                }}
                            >
                                {subhead}
                            </h2>
                        </div>
                    )}
                </div>

                {/* Featured Image */}
                {featuredImageUrl && (
                    <div className="mb-8">
                        <img
                            src={featuredImageUrl}
                            alt={t("Featured")}
                            className="w-full h-auto max-h-96 object-cover rounded-md shadow-md"
                        />
                    </div>
                )}

                {/* Content */}
                {sanitizedContent ? (
                    <div
                        className="article-content prose prose-lg dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{
                            __html: sanitizedContent,
                        }}
                        style={{
                            fontFamily: "Georgia, serif",
                            fontSize: "18px",
                            lineHeight: "1.8",
                        }}
                    />
                ) : (
                    <p className="text-gray-400 dark:text-gray-500 italic">
                        {t("No content to preview")}
                    </p>
                )}
            </article>
            <style>{`
                .article-content h1,
                .article-content h2,
                .article-content h3 {
                    font-family: 'Roboto', sans-serif !important;
                    font-weight: 700;
                }
                .article-content h1 {
                    font-size: 2.25rem;
                    line-height: 1.2;
                    margin: 2.25rem 0 1rem 0;
                }
                .article-content h2 {
                    font-size: 1.875rem;
                    line-height: 1.3;
                    margin: 2rem 0 1rem 0;
                }
                .article-content h3 {
                    font-size: 1.5rem;
                    line-height: 1.4;
                    margin: 1.75rem 0 0.875rem 0;
                }
            `}</style>
        </div>
    );
}
