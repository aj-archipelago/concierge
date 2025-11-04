// File validation configuration and utilities
export const FILE_VALIDATION_CONFIG = {
    // Maximum file size: 10MB (configurable per environment)
    MAX_FILE_SIZE: process.env.MAX_FILE_SIZE
        ? parseInt(process.env.MAX_FILE_SIZE)
        : 10 * 1024 * 1024,

    // Allowed MIME types - comprehensive list for applet files
    ALLOWED_MIME_TYPES: [
        // Images
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "image/bmp",
        "image/tiff",
        // Documents
        "application/pdf",
        "text/plain",
        "text/csv",
        "application/json",
        "text/markdown",
        "application/rtf",
        // Microsoft Office
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
        "application/msword", // .doc
        "application/vnd.ms-excel", // .xls
        "application/vnd.ms-powerpoint", // .ppt
        // OpenDocument formats
        "application/vnd.oasis.opendocument.text", // .odt
        "application/vnd.oasis.opendocument.spreadsheet", // .ods
        "application/vnd.oasis.opendocument.presentation", // .odp
        // Audio/Video
        "audio/mpeg",
        "audio/wav",
        "audio/mp3",
        "audio/ogg",
        "audio/webm",
        "video/mp4",
        "video/mpeg",
        "video/quicktime",
        "video/webm",
        "video/ogg",
        // Archives (be cautious with these)
        "application/zip",
        "application/x-zip-compressed",
        "application/gzip",
        "application/x-tar",
    ],
    // Dangerous file extensions to block (security critical)
    BLOCKED_EXTENSIONS: [
        ".exe",
        ".bat",
        ".cmd",
        ".com",
        ".pif",
        ".scr",
        ".vbs",
        ".js",
        ".jar",
        ".app",
        ".deb",
        ".pkg",
        ".rpm",
        ".dmg",
        ".iso",
        ".msi",
        ".sh",
        ".ps1",
        ".php",
        ".asp",
        ".aspx",
        ".jsp",
        ".py",
        ".rb",
        ".pl",
        ".cgi",
    ],
    // Maximum filename length
    MAX_FILENAME_LENGTH: 255,
};

// Enhanced file validation with security checks
export function validateFile(file, options = {}) {
    const config = { ...FILE_VALIDATION_CONFIG, ...options };
    const errors = [];
    const warnings = [];

    // Check file presence
    if (!file) {
        errors.push("File is required");
        return { isValid: false, errors, warnings };
    }

    // Check file size
    if (file.size > config.MAX_FILE_SIZE) {
        errors.push(
            `File size exceeds maximum limit of ${(config.MAX_FILE_SIZE / (1024 * 1024)).toFixed(1)}MB`,
        );
    }

    if (file.size === 0) {
        errors.push("File cannot be empty");
    }

    // Check MIME type
    if (!config.ALLOWED_MIME_TYPES.includes(file.type)) {
        errors.push(`File type '${file.type}' is not allowed`);
    }

    // Check filename length
    if (file.name.length > config.MAX_FILENAME_LENGTH) {
        errors.push(
            `Filename exceeds maximum length of ${config.MAX_FILENAME_LENGTH} characters`,
        );
    }

    // Check for dangerous file extensions
    const fileExtension = file.name
        .toLowerCase()
        .substring(file.name.lastIndexOf("."));
    if (config.BLOCKED_EXTENSIONS.includes(fileExtension)) {
        errors.push(
            `File extension '${fileExtension}' is not allowed for security reasons`,
        );
    }

    // Enhanced filename validation
    const suspiciousPatterns = [
        {
            pattern: /\.\./,
            message: "Filename contains path traversal characters",
        },
        {
            // eslint-disable-next-line no-control-regex
            pattern: /[<>:"|?*\x00-\x1f]/,
            message: "Filename contains invalid characters",
        },
        {
            pattern: /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i,
            message: "Filename uses reserved system name",
        },
        {
            pattern: /^\s+|\s+$/,
            message: "Filename cannot start or end with whitespace",
        },
        { pattern: /\.$/, message: "Filename cannot end with a period" },
    ];

    for (const { pattern, message } of suspiciousPatterns) {
        if (pattern.test(file.name)) {
            errors.push(message);
            break;
        }
    }

    // Check for potentially suspicious content patterns (basic)
    if (file.type.startsWith("text/") || file.type === "application/json") {
        // Add placeholder for future content scanning
        // This could include checking for malicious scripts, SQL injection patterns, etc.
        warnings.push("Text file content scanning not yet implemented");
    }

    // Additional security checks for specific file types
    if (file.type === "image/svg+xml") {
        warnings.push(
            "SVG files may contain scripts - manual review recommended",
        );
    }

    if (
        config.BLOCKED_EXTENSIONS.some((ext) =>
            file.name.toLowerCase().includes(ext),
        )
    ) {
        errors.push("Filename contains blocked extension pattern");
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        fileInfo: {
            name: file.name,
            size: file.size,
            type: file.type,
            extension: fileExtension,
        },
    };
}

// Virus scanning placeholder (integrate with external service)
export async function scanForMalware(file) {
    // Placeholder for virus scanning integration
    // This could integrate with services like:
    // - ClamAV
    // - VirusTotal API
    // - Windows Defender API
    // - Cloud-based scanning services

    return {
        clean: true,
        scanPerformed: false,
        message: "Malware scanning not yet implemented",
    };
}

// Content analysis for potential threats (basic implementation)
export function analyzeFileContent(file) {
    const analysis = {
        safe: true,
        risks: [],
        recommendations: [],
    };

    // Check for executable content in various file types
    if (file.type === "text/html" || file.type === "image/svg+xml") {
        analysis.risks.push("File type may contain executable content");
        analysis.recommendations.push("Review file content before processing");
    }

    if (
        file.type.startsWith("application/") &&
        !file.type.includes("pdf") &&
        !file.type.includes("json")
    ) {
        analysis.risks.push("Binary file type detected");
        analysis.recommendations.push("Verify file integrity and source");
    }

    analysis.safe = analysis.risks.length === 0;

    return analysis;
}

// MongoDB key validation configuration
export const MONGODB_KEY_VALIDATION_CONFIG = {
    // Maximum key length
    MAX_KEY_LENGTH: 100,
    // Allowed pattern: alphanumeric, underscores, hyphens
    ALLOWED_KEY_PATTERN: /^[a-zA-Z0-9_-]+$/,
    // Blocked MongoDB operators and dangerous patterns
    BLOCKED_PATTERNS: [
        /^\$/, // Any key starting with $
        /\./, // Any key containing dots
        /^_id$/, // Reserved MongoDB field
        /^__/, // Keys starting with double underscore (reserved)
    ],
    // Common MongoDB operators to explicitly block
    MONGODB_OPERATORS: [
        "$set",
        "$unset",
        "$inc",
        "$mul",
        "$rename",
        "$min",
        "$max",
        "$push",
        "$pull",
        "$pop",
        "$addToSet",
        "$each",
        "$position",
        "$slice",
        "$sort",
        "$bit",
        "$isolated",
        "$atomic",
        "$where",
        "$gt",
        "$gte",
        "$lt",
        "$lte",
        "$ne",
        "$in",
        "$nin",
        "$exists",
        "$type",
        "$mod",
        "$regex",
        "$options",
        "$all",
        "$size",
        "$elemMatch",
        "$not",
        "$and",
        "$or",
        "$nor",
    ],
};

/**
 * Validates a MongoDB key to prevent injection attacks
 * @param {string} key - The key to validate
 * @param {Object} options - Optional validation options
 * @returns {Object} - Validation result with isValid, errors, and sanitized key
 */
export function validateMongoDBKey(key, options = {}) {
    const config = { ...MONGODB_KEY_VALIDATION_CONFIG, ...options };
    const errors = [];

    // Check if key exists
    if (!key || typeof key !== "string") {
        errors.push("Key must be a non-empty string");
        return { isValid: false, errors, sanitizedKey: null };
    }

    // Trim whitespace
    const trimmedKey = key.trim();

    if (trimmedKey.length === 0) {
        errors.push("Key cannot be empty or only whitespace");
        return { isValid: false, errors, sanitizedKey: null };
    }

    // Check key length
    if (trimmedKey.length > config.MAX_KEY_LENGTH) {
        errors.push(
            `Key exceeds maximum length of ${config.MAX_KEY_LENGTH} characters`,
        );
    }

    // Check for MongoDB operators
    if (config.MONGODB_OPERATORS.includes(trimmedKey.toLowerCase())) {
        errors.push(`Key '${trimmedKey}' is a reserved MongoDB operator`);
    }

    // Check blocked patterns
    for (const pattern of config.BLOCKED_PATTERNS) {
        if (pattern.test(trimmedKey)) {
            if (pattern.source === "^\\$") {
                errors.push(
                    "Key cannot start with '$' (MongoDB operator prefix)",
                );
            } else if (pattern.source === "\\.") {
                errors.push(
                    "Key cannot contain '.' (dot notation not allowed)",
                );
            } else if (pattern.source === "^_id$") {
                errors.push("Key '_id' is reserved by MongoDB");
            } else if (pattern.source === "^__") {
                errors.push("Key cannot start with '__' (reserved prefix)");
            } else {
                errors.push(`Key contains blocked pattern: ${pattern.source}`);
            }
            break;
        }
    }

    // Check allowed pattern
    if (!config.ALLOWED_KEY_PATTERN.test(trimmedKey)) {
        errors.push(
            "Key can only contain letters, numbers, underscores, and hyphens",
        );
    }

    // Additional security checks
    const suspiciousPatterns = [
        // eslint-disable-next-line no-control-regex
        { pattern: /\x00/, message: "Key contains null bytes" },
        {
            // eslint-disable-next-line no-control-regex
            pattern: /[\x01-\x1f\x7f-\x9f]/,
            message: "Key contains control characters",
        },
        {
            pattern: /^\d+$/,
            message:
                "Key cannot be purely numeric (potential array index injection)",
        },
    ];

    for (const { pattern, message } of suspiciousPatterns) {
        if (pattern.test(trimmedKey)) {
            errors.push(message);
            break;
        }
    }

    const isValid = errors.length === 0;
    return {
        isValid,
        errors,
        sanitizedKey: isValid ? trimmedKey : null,
    };
}
