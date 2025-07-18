import { NextResponse } from "next/server";
import stringcase from "stringcase";
import * as LucideIcons from "lucide-react";

// Function to calculate Levenshtein distance between two strings
const levenshteinDistance = (str1, str2) => {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1, // insertion
                    matrix[i - 1][j] + 1, // deletion
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
};

// Function to calculate string similarity (0-1 scale, where 1 is identical)
const calculateSimilarity = (str1, str2) => {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;

    const distance = levenshteinDistance(
        str1.toLowerCase(),
        str2.toLowerCase(),
    );
    return 1 - distance / maxLength;
};

// Function to find the closest matching icon
const findClosestIcon = (requestedName, availableIcons) => {
    let bestMatch = null;
    let bestSimilarity = 0;

    availableIcons.forEach((iconName) => {
        const similarity = calculateSimilarity(requestedName, iconName);
        if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = iconName;
        }
    });

    return { bestMatch, bestSimilarity };
};

export async function GET(request, { params }) {
    try {
        const { name } = params;

        if (!name) {
            return NextResponse.json(
                { error: "Icon name is required" },
                { status: 400 },
            );
        }

        // The name parameter is expected to be in spinal-case format (e.g., "bar-chart-2")
        // Convert to PascalCase to match lucide-react component names
        const spinalCaseName = name;
        const pascalCaseName = stringcase.pascalcase(spinalCaseName);

        // Check if the icon exists in lucide-react
        const IconComponent = LucideIcons[pascalCaseName];

        if (!IconComponent) {
            // Find the closest match
            const availableIcons = Object.keys(LucideIcons);
            const { bestMatch, bestSimilarity } = findClosestIcon(
                pascalCaseName,
                availableIcons,
            );

            // If we have a reasonable match (similarity > 0.3), use it
            if (bestMatch && bestSimilarity > 0.3) {
                const closestIconComponent = LucideIcons[bestMatch];
                const closestSpinalCaseName = stringcase.spinalcase(bestMatch);

                // Create a temporary React element to render the SVG
                const React = await import("react");
                const iconElement = React.createElement(closestIconComponent, {
                    size: 24,
                    strokeWidth: 2,
                    fill: "none",
                });

                // Convert React element to SVG string
                const ReactDOMServer = await import("react-dom/server");
                const svgContent = ReactDOMServer.renderToString(iconElement);

                // Return the SVG content with appropriate headers and a warning about the substitution
                return new NextResponse(svgContent, {
                    status: 200,
                    headers: {
                        "Content-Type": "image/svg+xml",
                        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
                        "X-Icon-Substitution": `true`,
                        "X-Original-Requested": spinalCaseName,
                        "X-Substituted-With": closestSpinalCaseName,
                        "X-Similarity-Score": bestSimilarity.toString(),
                    },
                });
            } else {
                // No reasonable match found
                return NextResponse.json(
                    {
                        error: `Icon '${spinalCaseName}' not found`,
                        suggestion: bestMatch
                            ? `Did you mean '${stringcase.spinalcase(bestMatch)}'?`
                            : null,
                        availableIcons: availableIcons
                            .slice(0, 10)
                            .map((icon) => stringcase.spinalcase(icon)), // Show first 10 available icons
                    },
                    { status: 404 },
                );
            }
        }

        // Create a temporary React element to render the SVG
        const React = await import("react");
        const iconElement = React.createElement(IconComponent, {
            size: 24,
            strokeWidth: 2,
            fill: "none",
        });

        // Convert React element to SVG string
        const ReactDOMServer = await import("react-dom/server");
        const svgContent = ReactDOMServer.renderToString(iconElement);

        // Return the SVG content with appropriate headers
        return new NextResponse(svgContent, {
            status: 200,
            headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=86400", // Cache for 24 hours
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to generate icon" },
            { status: 500 },
        );
    }
}
