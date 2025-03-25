import React, { useEffect, useRef, useState } from "react";

export default function OutputSandbox({ content, height = "300px" }) {
    const iframeRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const resizeObserverRef = useRef(null);

    useEffect(() => {
        if (!iframeRef.current) return;

        const iframe = iframeRef.current;
        const setupFrame = async () => {
            try {
                setIsLoading(true);

                // Create a base tag to handle relative URLs
                const base = document.createElement("base");
                base.href = window.location.origin;

                // Create proper HTML structure
                const html = `
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1">
                            <style>
                                body { 
                                    margin: 0; 
                                    font-family: system-ui, -apple-system, sans-serif;
                                }
                                /* Ensure images don't overflow */
                                img { max-width: 100%; height: auto; }
                            </style>
                        </head>
                        <body>${content}</body>
                    </html>
                `;

                // Use srcdoc for better security and performance
                iframe.srcdoc = html;

                // Handle iframe load
                iframe.onload = () => {
                    const frameDoc =
                        iframe.contentDocument || iframe.contentWindow.document;

                    // Clean up any existing observer
                    if (resizeObserverRef.current) {
                        resizeObserverRef.current.disconnect();
                    }

                    // Setup new resize observer
                    const resizeObserver = new ResizeObserver((entries) => {
                        for (const entry of entries) {
                            const height = Math.max(
                                entry.contentRect.height,
                                entry.target.scrollHeight,
                            );
                            iframe.style.height = `${height}px`;
                        }
                    });

                    // Ensure body exists before observing
                    if (frameDoc.body) {
                        resizeObserver.observe(frameDoc.body);
                        resizeObserverRef.current = resizeObserver;
                    }

                    // Setup message handling for iframe->parent communication
                    iframe.contentWindow.addEventListener(
                        "message",
                        (event) => {
                            if (event.origin !== window.location.origin) return;
                            // Handle messages from the iframe
                            console.log("Message from sandbox:", event.data);
                        },
                    );

                    setIsLoading(false);
                };

                // Handle errors
                iframe.onerror = (error) => {
                    console.error("Sandbox iframe error:", error);
                    setIsLoading(false);
                };
            } catch (error) {
                console.error("Error setting up sandbox:", error);
                setIsLoading(false);
            }
        };

        setupFrame();

        // Cleanup
        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
            if (iframe.contentWindow) {
                iframe.contentWindow.removeEventListener("message", () => {});
            }
        };
    }, [content]);

    return (
        <div className="relative">
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                    <div className="text-gray-500">Loading...</div>
                </div>
            )}
            <iframe
                ref={iframeRef}
                style={{
                    width: "100%",
                    height,
                    border: "none",
                    backgroundColor: "transparent",
                    opacity: isLoading ? 0 : 1,
                    transition: "opacity 0.2s",
                }}
                sandbox="allow-scripts allow-popups allow-forms allow-same-origin allow-downloads allow-presentation"
                title="Output Sandbox"
            />
        </div>
    );
}
