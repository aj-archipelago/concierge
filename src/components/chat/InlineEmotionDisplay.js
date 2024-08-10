import React, { useState, useCallback, useRef, useEffect } from "react";

const emotionData = {
    happy: {
        color: "hsl(51, 100%, 50%)",
        description: "Feeling joyful and content",
    },
    sad: {
        color: "hsl(207, 44%, 49%)",
        description: "Feeling down or melancholy",
    },
    neutral: {
        color: "hsl(0, 0%, 66%)",
        description: "Neither particularly positive nor negative",
    },
    surprised: {
        color: "hsl(330, 100%, 71%)",
        description: "Feeling astonished or taken aback",
    },
    angry: {
        color: "hsl(9, 100%, 64%)",
        description: "Feeling frustrated or annoyed",
    },
    love: {
        color: "hsl(330, 100%, 71%)",
        description: "Feeling affectionate or caring",
    },
    excited: {
        color: "hsl(120, 61%, 50%)",
        description: "Feeling enthusiastic and eager",
    },
    thoughtful: {
        color: "hsl(260, 60%, 65%)",
        description: "Deep in contemplation",
    },
    tired: {
        color: "hsl(25, 76%, 31%)",
        description: "Feeling fatigued or sleepy",
    },
    amazed: {
        color: "hsl(51, 100%, 50%)",
        description: "Feeling wonderstruck or in awe",
    },
    embarrassed: {
        color: "hsl(9, 100%, 64%)",
        description: "Feeling self-conscious or uneasy",
    },
    confused: {
        color: "hsl(300, 47%, 75%)",
        description: "Feeling puzzled or perplexed",
    },
    grateful: {
        color: "hsl(177, 70%, 41%)",
        description: "Feeling thankful and appreciative",
    },
    hopeful: {
        color: "hsl(19, 100%, 74%)",
        description: "Feeling optimistic about the future",
    },
    curious: {
        color: "hsl(51, 100%, 50%)",
        description: "Eager to learn or know more",
    },
    proud: {
        color: "hsl(248, 53%, 58%)",
        description: "Feeling a sense of achievement",
    },
    determined: {
        color: "hsl(0, 68%, 42%)",
        description: "Feeling resolute and purposeful",
    },
    inspired: {
        color: "hsl(248, 79%, 67%)",
        description: "Feeling creatively stimulated",
    },
    calm: {
        color: "hsl(177, 70%, 41%)",
        description: "Feeling tranquil and at peace",
    },
    anxious: {
        color: "hsl(282, 68%, 50%)",
        description: "Feeling worried or uneasy",
    },
    amused: {
        color: "hsl(330, 100%, 71%)",
        description: "Finding something funny or entertaining",
    },
    nostalgic: {
        color: "hsl(34, 57%, 70%)",
        description: "Fondly remembering past experiences",
    },
    confident: {
        color: "hsl(210, 100%, 56%)",
        description: "Feeling self-assured and capable",
    },
    disappointed: {
        color: "hsl(30, 60%, 52%)",
        description: "Feeling let down or discouraged",
    },
    overwhelmed: {
        color: "hsl(260, 60%, 65%)",
        description: "Feeling overcome by circumstances",
    },
    content: {
        color: "hsl(120, 93%, 79%)",
        description: "Feeling satisfied and at ease",
    },
    intrigued: {
        color: "hsl(168, 100%, 56%)",
        description: "Feeling very interested or curious",
    },
    empathetic: {
        color: "hsl(330, 100%, 71%)",
        description: "Understanding and sharing others' feelings",
    },
    playful: {
        color: "hsl(330, 100%, 71%)",
        description: "Feeling fun-loving and full of energy",
    },
    touched: {
        color: "hsl(330, 100%, 71%)",
        description: "Feeling moved or appreciative",
    },
    admiration: {
        color: "hsl(225, 73%, 57%)",
        description: "Feeling respect and approval",
    },
    warm: {
        color: "hsl(19, 100%, 74%)",
        description: "Feeling friendly and caring",
    },
};

const generateColor = (emotion) => {
    let hash = 0;
    for (let i = 0; i < emotion.length; i++) {
        hash = emotion.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    const s = 60 + (hash % 30); // Saturation between 60% and 90%
    const l = 50 + (hash % 25); // Lightness between 50% and 75%

    return `hsl(${h}, ${s}%, ${l}%)`;
};

const getContrastColor = (hslColor) => {
    const [, , l] = hslColor.match(/\d+/g).map(Number);

    // Calculate relative luminance
    const luminance = l / 100;

    // Use a threshold that favors white text more often
    return luminance > 0.45 ? "hsl(0, 0%, 0%)" : "hsl(0, 0%, 100%)";
};

const hslToRgba = (hslColor, alpha = 1) => {
    const [h, s, l] = hslColor.match(/\d+/g).map(Number);
    const a = (s * Math.min(l, 100 - l)) / 100;
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round((255 * color) / 100);
    };
    return `rgba(${f(0)}, ${f(8)}, ${f(4)}, ${alpha})`;
};

const InlineEmotionDisplay = ({ emotion, children }) => {
    const [isUnderlined, setIsUnderlined] = useState(false);
    const [showBubble, setShowBubble] = useState(false);
    const [bubblePosition, setBubblePosition] = useState({ x: 0, y: 0 });
    const textRef = useRef(null);
    const bubbleRef = useRef(null);
    const timeoutRef = useRef(null);

    const lowercaseEmotion = emotion.toLowerCase();
    const emotionInfo = emotionData[lowercaseEmotion] || {
        color: generateColor(lowercaseEmotion),
        description: `Feeling ${lowercaseEmotion}`,
    };
    const { color, description } = emotionInfo;

    const backgroundColor = color;
    const textColor = getContrastColor(backgroundColor);

    const handleMouseEnter = useCallback((e) => {
        setIsUnderlined(true);
        setBubblePosition({ x: e.clientX, y: 0 });

        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Set a new timeout for the bubble to appear
        timeoutRef.current = setTimeout(() => {
            setShowBubble(true);
        }, 300); // 300ms delay, adjust as needed
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsUnderlined(false);
        setShowBubble(false);

        // Clear the timeout if it exists
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    }, []);

    const handleMouseDown = useCallback(() => {
        setShowBubble(false);
    }, []);

    useEffect(() => {
        if (showBubble && textRef.current && bubbleRef.current) {
            const textRect = textRef.current.getBoundingClientRect();
            const bubbleRect = bubbleRef.current.getBoundingClientRect();

            setBubblePosition((prev) => ({
                ...prev,
                y: textRect.top - bubbleRect.height - 2,
            }));
        }
    }, [showBubble]);

    const pulseKeyframes = `
  @keyframes pulse-underline-${lowercaseEmotion} {
    0%, 100% { border-bottom-color:${hslToRgba(backgroundColor, 0.6)}; }
    50% { border-bottom-color: ${hslToRgba(backgroundColor, 0.8)}; }
  }
`;

    return (
        <span
            ref={textRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleMouseDown}
            style={{
                display: "inline",
                position: "relative",
            }}
        >
            <style>{pulseKeyframes}</style>
            <span
                style={{
                    borderBottom: `1px solid ${hslToRgba(backgroundColor, 0.8)}`,
                    animation: isUnderlined
                        ? "none"
                        : `pulse-underline-${lowercaseEmotion} 1s ease-in-out infinite`,
                    padding: "0 1px",
                    transition: "border-bottom-color 0.3s ease",
                }}
            >
                {children}
            </span>
            {showBubble && (
                <span
                    ref={bubbleRef}
                    style={{
                        position: "fixed",
                        left: bubblePosition.x,
                        top: bubblePosition.y,
                        transform: "translateX(-50%)",
                        backgroundColor: hslToRgba(backgroundColor),
                        color: hslToRgba(textColor),
                        padding: "2px 4px",
                        borderRadius: "4px",
                        fontSize: "0.8em",
                        whiteSpace: "nowrap",
                        zIndex: 10,
                        pointerEvents: "none",
                        opacity: showBubble ? 1 : 0,
                        transition: "opacity 0.2s ease-in-out",
                    }}
                >
                    {lowercaseEmotion}: {description}
                </span>
            )}
        </span>
    );
};

export default InlineEmotionDisplay;
