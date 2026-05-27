// imageTools.js
// Image canvas-specific client-side tool handlers
// These tools are available when an image is loaded in the canvas

/**
 * Contextual tool definitions for image canvas
 * These tools are only available when viewing an image in the canvas
 */
export const IMAGE_CONTEXTUAL_TOOLS = [
    {
        type: "function",
        icon: "✨",
        function: {
            name: "ModifyImage",
            description:
                "Modify the image currently displayed in the canvas using AI. Use this tool when the user asks to modify, edit, change, alter, or transform the image using AI. This tool uses AI image editing to make changes based on a text description. Examples: 'add a sunset sky', 'change the background to a beach', 'make it more colorful', 'remove the person in the background', 'add snow to the scene'.",
            descriptionAr:
                "عدّل الصورة الظاهرة في اللوحة بالذكاء الاصطناعي. عند «عدّل الصورة» أو «غيّر الخلفية» ونحوها. يعتمد وصفاً نصياً للتغييرات.",
            parameters: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description:
                            "A detailed description of how to modify the image. Be specific about what changes to make (e.g., 'Add a sunset sky with orange and pink clouds', 'Change the background to a tropical beach', 'Make the colors more vibrant and saturated').",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about modifying the image",
                    },
                },
                required: ["prompt", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🔄",
        function: {
            name: "ApplyImageTransform",
            description:
                "Apply visual transformations to the image currently displayed in the canvas. Use this tool when the user asks to rotate, flip, adjust brightness/contrast/saturation, or apply other visual transformations to the image. This tool applies transformations that can be previewed and saved.",
            descriptionAr:
                "طبّق تدوير، انعكاساً، سطوعاً، تبايناً، تشبعاً وغيرها على صورة اللوحة. عند تعديل بصري بسيط دون توليد بمحادثة.",
            parameters: {
                type: "object",
                properties: {
                    rotation: {
                        type: "number",
                        description:
                            "Rotation angle in degrees (0-360). Positive values rotate clockwise, negative values rotate counterclockwise. Examples: 90, -90, 180, 45.",
                    },
                    flipHorizontal: {
                        type: "boolean",
                        description:
                            "Whether to flip the image horizontally (mirror left-to-right). Defaults to false.",
                    },
                    flipVertical: {
                        type: "boolean",
                        description:
                            "Whether to flip the image vertically (mirror top-to-bottom). Defaults to false.",
                    },
                    brightness: {
                        type: "number",
                        description:
                            "Brightness adjustment (-100 to 100). Positive values make the image brighter, negative values make it darker. Defaults to 0 (no change).",
                    },
                    contrast: {
                        type: "number",
                        description:
                            "Contrast adjustment (-100 to 100). Positive values increase contrast, negative values decrease it. Defaults to 0 (no change).",
                    },
                    saturation: {
                        type: "number",
                        description:
                            "Saturation adjustment (-100 to 100). Positive values make colors more vibrant, negative values make them more muted/grayscale. Defaults to 0 (no change).",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about applying the transform",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "🖼️",
        function: {
            name: "ReplaceImage",
            description:
                "Replace the current image in the canvas with a new image URL. Use this tool when the user asks to replace the image, change the image, load a different image, or set a new image. The new image will be displayed in the canvas.",
            descriptionAr:
                "استبدل صورة اللوحة بعنوان URL لصورة جديدة. عند «صورة أخرى» أو «استبدل الصورة».",
            parameters: {
                type: "object",
                properties: {
                    imageUrl: {
                        type: "string",
                        description:
                            "The URL of the new image to display in the canvas. This should be a valid image URL that can be loaded by the browser.",
                    },
                    title: {
                        type: "string",
                        description:
                            "Optional: A title or filename for the new image. If not provided, will use the image URL or a default title.",
                    },
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about replacing the image",
                    },
                },
                required: ["imageUrl", "userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "ℹ️",
        function: {
            name: "GetImageInfo",
            description:
                "Get information about the image currently displayed in the canvas. Use this tool when the user asks about the image, wants to see image details, or needs information about the current image.",
            descriptionAr:
                "اعرض معلومات عن صورة اللوحة الحالية (بيانات وصفية). عند سؤال عن تفاصيل الصورة.",
            parameters: {
                type: "object",
                properties: {
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about getting image information",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
    {
        type: "function",
        icon: "👁️",
        function: {
            name: "ReadImageContent",
            description:
                "Get file information (hash, URL, filename) for the image currently displayed in the canvas. Use this tool when you need to analyze, describe, or understand what's actually shown in the image (e.g., 'what does this image show?', 'describe this image', 'what colors are in this image?'). The tool returns file metadata that you can use with your internal file reading tools to access the image content.",
            descriptionAr:
                "احصل على بيانات الملف (hash وURL والاسم) لصورة اللوحة لاستخدام أدوات القراءة مع المحتوى. عند وصف المشهد أو الألوان.",
            parameters: {
                type: "object",
                properties: {
                    userMessage: {
                        type: "string",
                        description:
                            "A user-friendly message about reading the image content",
                    },
                },
                required: ["userMessage"],
            },
        },
    },
];

/**
 * Handler for ModifyImage tool
 * Modifies the image using AI image editing
 */
export async function handleModifyImage(toolInfo, context) {
    // Support multiple parameter formats:
    // 1. toolArgs (standard client-side format from useStreamingMessages)
    // 2. args (server-side tool format)
    // 3. direct properties on toolInfo
    // The backend may send args directly, or it may be nested in toolArgs
    const toolArgs = toolInfo.toolArgs || toolInfo.args || toolInfo;

    // Debug logging (development only) - avoid logging sensitive data
    if (process.env.NODE_ENV === "development") {
        console.log("[ModifyImage] Tool info structure:", {
            hasToolArgs: !!toolInfo.toolArgs,
            hasArgs: !!toolInfo.args,
            toolArgsKeys: toolInfo.toolArgs
                ? Object.keys(toolInfo.toolArgs)
                : [],
            argsKeys: toolInfo.args ? Object.keys(toolInfo.args) : [],
            directKeys: Object.keys(toolInfo).filter(
                (k) =>
                    ![
                        "toolArgs",
                        "args",
                        "toolCallbackName",
                        "toolCallbackId",
                        "requestId",
                    ].includes(k),
            ),
        });
    }

    // Support both 'prompt' (client-side) and 'detailedInstructions' (server-side tool format)
    // Also check if detailedInstructions is nested deeper
    const prompt =
        toolArgs.prompt ||
        toolArgs.detailedInstructions ||
        (toolInfo.args && toolInfo.args.detailedInstructions) ||
        (toolInfo.toolArgs && toolInfo.toolArgs.detailedInstructions);
    const userMessage =
        toolArgs.userMessage ||
        (toolInfo.args && toolInfo.args.userMessage) ||
        (toolInfo.toolArgs && toolInfo.toolArgs.userMessage);

    if (process.env.NODE_ENV === "development") {
        console.log("[ModifyImage] Extracted values:", {
            hasPrompt: !!prompt,
            promptType: typeof prompt,
            promptLength: prompt?.length,
        });
    }

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        const errorDetails = {
            hasToolArgs: !!toolInfo.toolArgs,
            hasArgs: !!toolInfo.args,
            toolArgsKeys: toolInfo.toolArgs
                ? Object.keys(toolInfo.toolArgs)
                : [],
            argsKeys: toolInfo.args ? Object.keys(toolInfo.args) : [],
            allKeys: Object.keys(toolInfo),
        };

        // Log detailed diagnostics only for debugging; avoid exposing them via the Error message.
        if (
            typeof process === "undefined" ||
            !process.env ||
            process.env.NODE_ENV !== "production"
        ) {
            console.error(
                "[ModifyImage] Missing or invalid prompt. Diagnostic details:",
                errorDetails,
            );
        }

        throw new Error("Prompt is required for image modification.");
    }

    // Get the runTask function and image URL from context
    const { runTask, getImageUrl, handleModifyTaskEnqueued } = context || {};

    if (!runTask || typeof runTask.mutateAsync !== "function") {
        throw new Error("runTask function not available in tool context");
    }

    if (!getImageUrl || typeof getImageUrl !== "function") {
        throw new Error("getImageUrl function not available in tool context");
    }

    try {
        const imageUrl = getImageUrl();
        if (!imageUrl) {
            throw new Error("No image URL available for modification");
        }

        // Default model for image modification (same as ModifyImageDialog)
        const defaultModel = "replicate-qwen-image-edit-plus";

        const taskData = {
            type: "media-generation",
            prompt: prompt.trim(),
            outputType: "image",
            model: defaultModel,
            inputImageUrl: imageUrl,
            inputImageUrl2: "",
            inputImageUrl3: "",
            settings: {
                quality: "draft",
            },
            source: "canvas_image_modify",
        };

        const result = await runTask.mutateAsync(taskData);
        if (result.taskId && handleModifyTaskEnqueued) {
            handleModifyTaskEnqueued(result.taskId);
        }

        return {
            success: true,
            data: {
                prompt: prompt.trim(),
                taskId: result.taskId,
                description: `Image modification requested: "${prompt.trim()}". The AI will process your request and generate a modified version of the image. ${userMessage || ""}`,
            },
        };
    } catch (error) {
        throw new Error(`Failed to modify image: ${error.message}`);
    }
}

/**
 * Handler for ApplyImageTransform tool
 * Applies visual transformations to the image
 */
export async function handleApplyImageTransform(toolInfo, context) {
    const {
        rotation,
        flipHorizontal,
        flipVertical,
        brightness,
        contrast,
        saturation,
        userMessage,
    } = toolInfo.toolArgs || toolInfo;

    // Get the transform functions from context
    const { setImageTransform, getImageTransform } = context || {};

    if (!setImageTransform || typeof setImageTransform !== "function") {
        throw new Error(
            "setImageTransform function not available in tool context",
        );
    }

    try {
        // Get current transform
        const currentTransform = getImageTransform
            ? getImageTransform()
            : {
                  rotation: 0,
                  scaleX: 1,
                  scaleY: 1,
                  brightness: 0,
                  contrast: 0,
                  saturation: 0,
              };

        // Build updated transform
        const updatedTransform = { ...currentTransform };

        // Apply rotation if provided
        if (rotation !== undefined && rotation !== null) {
            // Normalize rotation to 0-360 range
            let normalizedRotation = rotation % 360;
            if (normalizedRotation < 0) {
                normalizedRotation += 360;
            }
            updatedTransform.rotation = normalizedRotation;
        }

        // Apply flips if provided
        if (flipHorizontal !== undefined && flipHorizontal !== null) {
            updatedTransform.scaleX = flipHorizontal ? -1 : 1;
        }
        if (flipVertical !== undefined && flipVertical !== null) {
            updatedTransform.scaleY = flipVertical ? -1 : 1;
        }

        // Apply adjustments if provided
        if (brightness !== undefined && brightness !== null) {
            updatedTransform.brightness = Math.max(
                -100,
                Math.min(100, brightness),
            );
        }
        if (contrast !== undefined && contrast !== null) {
            updatedTransform.contrast = Math.max(-100, Math.min(100, contrast));
        }
        if (saturation !== undefined && saturation !== null) {
            updatedTransform.saturation = Math.max(
                -100,
                Math.min(100, saturation),
            );
        }

        // Apply the transform
        setImageTransform(updatedTransform);

        // Build description of changes
        const changes = [];
        if (rotation !== undefined && rotation !== null) {
            changes.push(`rotated ${rotation}°`);
        }
        if (flipHorizontal) {
            changes.push("flipped horizontally");
        }
        if (flipVertical) {
            changes.push("flipped vertically");
        }
        if (
            brightness !== undefined &&
            brightness !== null &&
            brightness !== 0
        ) {
            changes.push(
                `brightness ${brightness > 0 ? "+" : ""}${brightness}`,
            );
        }
        if (contrast !== undefined && contrast !== null && contrast !== 0) {
            changes.push(`contrast ${contrast > 0 ? "+" : ""}${contrast}`);
        }
        if (
            saturation !== undefined &&
            saturation !== null &&
            saturation !== 0
        ) {
            changes.push(
                `saturation ${saturation > 0 ? "+" : ""}${saturation}`,
            );
        }

        const changesDescription =
            changes.length > 0
                ? `Applied: ${changes.join(", ")}.`
                : "No changes applied (all values were default or unchanged).";

        return {
            success: true,
            data: {
                transform: updatedTransform,
                description: `${changesDescription} ${userMessage || ""}`,
            },
        };
    } catch (error) {
        throw new Error(`Failed to apply image transform: ${error.message}`);
    }
}

/**
 * Handler for ReplaceImage tool
 * Replaces the current image with a new one
 */
export async function handleReplaceImage(toolInfo, context) {
    const { imageUrl, title, userMessage } = toolInfo.toolArgs || toolInfo;

    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
        throw new Error("Image URL is required to replace the image");
    }

    // Get the dispatch and activeTabId from context
    const { dispatch, getActiveTabId } = context || {};

    if (!dispatch) {
        throw new Error("dispatch not available in tool context");
    }

    try {
        const newImageUrl = imageUrl.trim();
        const newTitle = title?.trim() || "Image";

        // Use dispatch to update canvas tab
        const { openCanvas, updateCanvasTab } = await import(
            "../../src/stores/chatSlice"
        );

        const activeTabId = getActiveTabId ? getActiveTabId() : null;

        if (activeTabId) {
            // Update existing tab
            dispatch(
                updateCanvasTab({
                    tabId: activeTabId,
                    content: {
                        type: "image",
                        title: newTitle,
                        url: newImageUrl,
                        alt: newTitle,
                    },
                }),
            );
        } else {
            // Create new tab
            dispatch(
                openCanvas({
                    type: "image",
                    title: newTitle,
                    url: newImageUrl,
                    alt: newTitle,
                }),
            );
        }

        return {
            success: true,
            data: {
                imageUrl: newImageUrl,
                title: newTitle,
                description: `Image replaced with: "${newTitle}". ${userMessage || ""}`,
            },
        };
    } catch (error) {
        throw new Error(`Failed to replace image: ${error.message}`);
    }
}

/**
 * Handler for GetImageInfo tool
 * Returns information about the current image
 */
export async function handleGetImageInfo(toolInfo, context) {
    const { userMessage } = toolInfo.toolArgs || toolInfo;

    // Get image information from context
    const {
        getImageUrl,
        getImageTitle,
        getImageAlt,
        getImageFileHash,
        getImageFilename,
    } = context || {};

    if (!getImageUrl || typeof getImageUrl !== "function") {
        throw new Error("getImageUrl function not available in tool context");
    }

    try {
        const imageUrl = getImageUrl();
        const imageTitle = getImageTitle ? getImageTitle() : null;
        const imageAlt = getImageAlt ? getImageAlt() : null;
        const imageFileHash = getImageFileHash ? getImageFileHash() : null;
        const imageFilename = getImageFilename ? getImageFilename() : null;

        if (!imageUrl) {
            return {
                success: true,
                data: {
                    imageUrl: null,
                    description: `No image is currently displayed in the canvas. ${userMessage || ""}`,
                },
            };
        }

        // Build description
        const infoParts = [`Image URL: ${imageUrl}`];
        if (imageTitle) {
            infoParts.push(`Title: ${imageTitle}`);
        }
        if (imageFilename) {
            infoParts.push(`Filename: ${imageFilename}`);
        }
        if (imageAlt) {
            infoParts.push(`Alt text: ${imageAlt}`);
        }
        if (imageFileHash) {
            infoParts.push(`File hash: ${imageFileHash}`);
        }

        return {
            success: true,
            data: {
                imageUrl,
                title: imageTitle,
                filename: imageFilename,
                alt: imageAlt,
                fileHash: imageFileHash,
                description: `${infoParts.join(". ")}. ${userMessage || ""}`,
            },
        };
    } catch (error) {
        throw new Error(`Failed to get image info: ${error.message}`);
    }
}

/**
 * Handler for ReadImageContent tool
 * Returns file metadata (hash, URL, filename) instead of base64 data
 * The AI can use its internal tools to read the file content using this metadata
 */
export async function handleReadImageContent(toolInfo, context) {
    const { userMessage } = toolInfo.toolArgs || toolInfo;

    // Get image information from context
    const { getImageUrl, getImageFileHash, getImageFilename, getImageTitle } =
        context || {};

    if (!getImageUrl || typeof getImageUrl !== "function") {
        throw new Error("getImageUrl function not available in tool context");
    }

    try {
        const imageUrl = getImageUrl();
        const imageFileHash = getImageFileHash ? getImageFileHash() : null;
        const imageFilename = getImageFilename ? getImageFilename() : null;
        const imageTitle = getImageTitle ? getImageTitle() : null;

        if (!imageUrl) {
            return {
                success: true,
                data: {
                    fileHash: null,
                    url: null,
                    filename: null,
                    description: `No image is currently displayed in the canvas. ${userMessage || ""}`,
                },
            };
        }

        // Build description with file metadata
        const infoParts = [];
        if (imageFileHash) {
            infoParts.push(`File hash: ${imageFileHash}`);
        }
        if (imageUrl) {
            infoParts.push(`URL: ${imageUrl}`);
        }
        if (imageFilename) {
            infoParts.push(`Filename: ${imageFilename}`);
        }
        if (imageTitle) {
            infoParts.push(`Title: ${imageTitle}`);
        }

        const description =
            infoParts.length > 0
                ? `Image file information: ${infoParts.join(", ")}. Use your internal file reading tools with this hash or URL to access the image content. ${userMessage || ""}`
                : `Image URL: ${imageUrl}. Use your internal file reading tools with this URL to access the image content. ${userMessage || ""}`;

        return {
            success: true,
            data: {
                fileHash: imageFileHash,
                url: imageUrl,
                filename: imageFilename,
                title: imageTitle,
                description,
            },
        };
    } catch (error) {
        throw new Error(`Failed to read image content: ${error.message}`);
    }
}

/**
 * Tool handlers mapping
 * Maps tool names (lowercase) to their handler functions
 */
export const IMAGE_TOOL_HANDLERS = {
    modifyimage: handleModifyImage,
    applyimagetransform: handleApplyImageTransform,
    replaceimage: handleReplaceImage,
    getimageinfo: handleGetImageInfo,
    readimagecontent: handleReadImageContent,
};
