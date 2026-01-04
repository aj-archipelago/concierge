import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { convertMessageToMarkdown } from "../ChatMessage";

// Mock react-markdown with realistic end-to-end behavior
// This simulates actual markdown processing including bold/italic interpretation
// which catches bugs like __CURRENCY_0__ being interpreted as bold
jest.mock("react-markdown", () => {
    const React = require("react");
    return {
        __esModule: true,
        default: ({ children, className, rehypePlugins }) => {
            let processedText =
                typeof children === "string" ? children : String(children);

            // Simulate markdown processing: __text__ becomes bold, *text* becomes italic
            // This is critical - it catches the bug where __CURRENCY_0__ gets interpreted as bold
            processedText = processedText
                .replace(/__(.+?)__/g, "<strong>$1</strong>") // Bold
                .replace(/\*(.+?)\*/g, "<em>$1</em>"); // Italic

            // Process rehype plugins if they exist (this is the real behavior we need to test)
            if (rehypePlugins && rehypePlugins.length > 0) {
                const mockTree = {
                    type: "root",
                    children: [
                        {
                            type: "element",
                            tagName: "p",
                            children: [
                                {
                                    type: "text",
                                    value: processedText,
                                },
                            ],
                        },
                    ],
                };

                rehypePlugins.forEach((plugin) => {
                    try {
                        if (Array.isArray(plugin) && plugin.length === 2) {
                            const [pluginFn, options] = plugin;
                            if (typeof pluginFn === "function") {
                                const transformer = pluginFn(options);
                                if (typeof transformer === "function") {
                                    transformer(mockTree);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Plugin error:", e);
                    }
                });

                // Extract text from tree (AST nodes, not DOM - eslint-disable for mock)
                // eslint-disable-next-line testing-library/no-node-access
                const extractText = (node) => {
                    // eslint-disable-next-line testing-library/no-node-access
                    if (node.type === "text" && node.value) return node.value;
                    // eslint-disable-next-line testing-library/no-node-access
                    if (node.children) {
                        // eslint-disable-next-line testing-library/no-node-access
                        return node.children
                            .map(extractText)
                            .filter(Boolean)
                            .join("");
                    }
                    return "";
                };

                const extracted = extractText(mockTree);
                if (extracted) processedText = extracted;
            }

            return React.createElement(
                "div",
                { className, "data-testid": "markdown" },
                processedText,
            );
        },
    };
});

// Mock ESM dependencies that cause issues
jest.mock("remark-directive", () => ({
    __esModule: true,
    default: () => () => {},
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => () => {} }));
jest.mock("remark-math", () => ({ __esModule: true, default: () => () => {} }));
jest.mock("rehype-katex", () => ({
    __esModule: true,
    default: () => (tree) => tree,
}));
jest.mock("rehype-raw", () => ({
    __esModule: true,
    default: () => (tree) => tree,
}));
jest.mock("katex/dist/katex.min.css", () => ({}));
jest.mock("unist-util-visit", () => ({
    visit: (tree, type, visitor) => {
        // eslint-disable-next-line testing-library/no-node-access
        const traverse = (node) => {
            if (!node) return;
            // eslint-disable-next-line testing-library/no-node-access
            if (node.type === type && visitor) visitor(node);
            // eslint-disable-next-line testing-library/no-node-access
            if (node.children) {
                // eslint-disable-next-line testing-library/no-node-access
                node.children.forEach(traverse);
            }
        };
        traverse(tree);
    },
}));

// Mock i18next
jest.mock("i18next", () => ({
    t: jest.fn((key) => key),
    language: "en",
}));

// Mock the components that ChatMessage depends on
jest.mock("../../code/CodeBlock", () => ({
    __esModule: true,
    default: ({ code, language }) => (
        <pre data-testid="code-block" data-language={language}>
            {code}
        </pre>
    ),
}));

jest.mock("../TextWithCitations", () => ({
    __esModule: true,
    default: ({ children }) => <div>{children}</div>,
}));

jest.mock("../InlineEmotionDisplay", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../MediaCard", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../../code/MermaidDiagram", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../../code/MermaidPlaceholder", () => ({
    __esModule: true,
    default: () => null,
}));

describe("ChatMessage Currency Protection", () => {
    const renderMessage = (payload) => {
        const message = {
            payload,
            tool: null,
        };
        const result = convertMessageToMarkdown(message);
        return render(result);
    };

    describe("Currency amounts should not be parsed as math", () => {
        it("should protect basic currency amounts", () => {
            const { container } = renderMessage(
                "Revenue is $1,000 this quarter.",
            );
            const text = container.textContent || "";
            expect(text).toContain("$1,000");
            // Should not contain currency placeholders in final output
            expect(text).not.toContain("«CURRENCY");
        });

        it("should protect currency with decimals", () => {
            const { container } = renderMessage("Price: $123.45");
            const text = container.textContent || "";
            expect(text).toContain("$123.45");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should protect large currency amounts", () => {
            const { container } = renderMessage("Total: $1,234,567.89");
            const text = container.textContent || "";
            expect(text).toContain("$1,234,567.89");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should protect negative currency amounts", () => {
            const { container } = renderMessage("Loss: -$1,000");
            const text = container.textContent || "";
            expect(text).toContain("-$1,000");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should protect currency in parentheses (accounting notation)", () => {
            const { container } = renderMessage("Net: ($1,000)");
            const text = container.textContent || "";
            expect(text).toContain("($1,000)");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should protect currency ranges", () => {
            const { container } = renderMessage("Budget: $1,000-$2,000");
            const text = container.textContent || "";
            expect(text).toContain("$1,000");
            expect(text).toContain("$2,000");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should protect multiple currency amounts in same text", () => {
            const { container } = renderMessage(
                "Q1: $1,000, Q2: $2,000, Q3: $3,000",
            );
            const text = container.textContent || "";
            expect(text).toContain("$1,000");
            expect(text).toContain("$2,000");
            expect(text).toContain("$3,000");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should protect currency amounts with words like million, billion", () => {
            const { container } = renderMessage(
                "The company lost approximately $77 million in 2023, with losses closer to $100 million for the full year.",
            );
            const text = container.textContent || "";
            expect(text).toContain("$77 million");
            expect(text).toContain("$100 million");
            expect(text).not.toContain("{CURRENCY_");
        });

        it("should protect currency ranges with dashes like $150M–$200M", () => {
            const { container } = renderMessage(
                "WaPo's technology costs are likely in the $150M–$200M range annually.",
            );
            const text = container.textContent || "";
            expect(text).toContain("$150M");
            expect(text).toContain("$200M");
            expect(text).not.toContain("{CURRENCY_");
        });
    });

    describe("Math equations should still work", () => {
        it("should allow inline math with single dollar signs", () => {
            const { container } = renderMessage(
                "The formula is $x^2 + y^2 = z^2$",
            );
            // Math should be rendered (we can't easily test KaTeX rendering in unit tests,
            // but we can verify the currency protection didn't interfere)
            const text = container.textContent || "";
            // Should not contain currency placeholders
            expect(text).not.toContain("«CURRENCY");
        });

        it("should allow block math with double dollar signs", () => {
            const { container } = renderMessage(
                "The equation is:\n\n$$\\int_0^1 x^2 dx = \\frac{1}{3}$$\n\n",
            );
            const text = container.textContent || "";
            // Should not contain currency placeholders
            expect(text).not.toContain("«CURRENCY");
        });

        it("should not protect single-digit amounts that are likely math", () => {
            const { container } = renderMessage(
                "Find values where $x$ such that $1 + x^{10}$ is divisible by $10$. " +
                    "If $x$ ends in $0$, $1$, $2$, $3$, $7$, or $9$, check the result.",
            );
            const text = container.textContent || "";
            // Single-digit amounts in math context should not be protected
            expect(text).not.toContain("{CURRENCY_");
            // But should still allow math rendering
            expect(text).toContain("$x$");
        });

        it("should protect single-digit amounts with decimals (currency)", () => {
            const { container } = renderMessage(
                "The price is $1.00 or $5.50 per item.",
            );
            const text = container.textContent || "";
            // Single digits with decimals should be protected as currency
            expect(text).toContain("$1.00");
            expect(text).toContain("$5.50");
            expect(text).not.toContain("{CURRENCY_");
        });

        it("should not protect math expressions between $ signs", () => {
            const { container } = renderMessage(
                "Find $x$ such that $1 + x^{10}$ is divisible by $10$. " +
                    "If $x$ ends in $0$, $1$, $2$, $3$, $7$, or $9$, check the result.",
            );
            const text = container.textContent || "";
            // Math expressions between $ signs should not be protected
            expect(text).not.toContain("{CURRENCY_");
            // Should still contain the math expressions
            expect(text).toContain("$x$");
            expect(text).toContain("$1 + x^{10}$");
        });

        it("should protect currency amounts between $ signs if they match currency pattern", () => {
            const { container } = renderMessage(
                "The amount is $1,000$ or $123.45$.",
            );
            const text = container.textContent || "";
            // Currency amounts between $ signs should be protected
            expect(text).toContain("$1,000");
            expect(text).toContain("$123.45");
            expect(text).not.toContain("{CURRENCY_");
        });

        it("should not protect plain numbers between $ signs (they're math)", () => {
            const { container } = renderMessage(
                "Find x such that x = $10$ or x = $100$.",
            );
            const text = container.textContent || "";
            // Plain numbers between $ signs should not be protected (they're math)
            expect(text).not.toContain("{CURRENCY_");
            // Should still contain the math expressions
            expect(text).toContain("$10$");
            expect(text).toContain("$100$");
        });

        it("should not protect single-digit numbers between $ signs (they're math)", () => {
            const { container } = renderMessage("Find x such that x = $6$.");
            const text = container.textContent || "";
            // Single-digit numbers between $ signs should not be protected (they're math)
            expect(text).not.toContain("{CURRENCY_");
            expect(text).toContain("$6$");
        });

        it("should protect single-digit standalone amounts (they're currency)", () => {
            const { container } = renderMessage("Prices range from $5 to $9.");
            const text = container.textContent || "";
            // Single-digit standalone amounts should be protected as currency
            expect(text).toContain("$5");
            expect(text).toContain("$9");
            expect(text).not.toContain("{CURRENCY_");
        });

        it("should protect currency ranges like $10M-$12M", () => {
            const { container } = renderMessage("The budget is $10M-$12M.");
            const text = container.textContent || "";
            // Currency ranges should be protected (not math)
            expect(text).toContain("$10M");
            expect(text).toContain("$12M");
            expect(text).not.toContain("{CURRENCY_");
        });

        it("should not protect math expressions with closing $", () => {
            const { container } = renderMessage(
                "Find x where x = $10$ or x = $10M$.",
            );
            const text = container.textContent || "";
            // Math expressions with closing $ should not be protected
            expect(text).not.toContain("{CURRENCY_");
            expect(text).toContain("$10$");
            expect(text).toContain("$10M$");
        });

        it("should not protect currency patterns inside math expressions", () => {
            const { container } = renderMessage(
                "If $x$ ends in 0: $0^{10}$ ends in $0$. " +
                    "If $x$ ends in 1: $1^{10}$ ends in $1$. " +
                    "If $x$ ends in 3: $3^{10}$ ends in $9$.",
            );
            const text = container.textContent || "";
            // Currency patterns inside $...$ math should not be protected
            expect(text).not.toContain("{CURRENCY_");
            expect(text).toContain("$0^{10}$");
            expect(text).toContain("$1^{10}$");
            expect(text).toContain("$3^{10}$");
        });
    });

    describe("Mixed content (currency and math)", () => {
        it("should handle currency and math in the same message", () => {
            const { container } = renderMessage(
                "Revenue is $1,000 and the formula is $x^2$",
            );
            const text = container.textContent || "";
            expect(text).toContain("$1,000");
            // Math should still work (can't easily verify KaTeX, but no placeholders)
            expect(text).not.toContain("«CURRENCY");
        });

        it("should handle multiple currencies and math expressions", () => {
            const { container } = renderMessage(
                "Q1: $1,000, Q2: $2,000. Formula: $E = mc^2$",
            );
            const text = container.textContent || "";
            expect(text).toContain("$1,000");
            expect(text).toContain("$2,000");
            expect(text).not.toContain("«CURRENCY");
        });
    });

    describe("Edge cases", () => {
        it("should not protect shell variables (in code blocks)", () => {
            const { container } = renderMessage(
                "Use `$HOME` for home directory",
            );
            const text = container.textContent || "";
            // Shell variables in code should not be affected
            expect(text).toContain("$HOME");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should not process dollar signs inside inline code", () => {
            const { container } = renderMessage(
                "Run `echo $HOME$` or `price = $10$` in code.",
            );
            const text = container.textContent || "";
            // Dollar signs in inline code should not be processed
            expect(text).toContain("$HOME$");
            expect(text).toContain("$10$");
            expect(text).not.toContain("{CURRENCY_");
            expect(text).not.toContain("__MATH_");
        });

        it("should not process dollar signs inside code fences", () => {
            const { container } = renderMessage(
                "```bash\n" +
                    "echo $HOME$\n" +
                    "price = $10$\n" +
                    "amount = $1,000\n" +
                    "```",
            );
            const text = container.textContent || "";
            // Dollar signs in code fences should not be processed
            expect(text).toContain("$HOME$");
            expect(text).toContain("$10$");
            expect(text).toContain("$1,000");
            expect(text).not.toContain("{CURRENCY_");
            expect(text).not.toContain("__MATH_");
        });

        it("should handle currency at start of line", () => {
            const { container } = renderMessage(
                "$1,000 is the starting amount.",
            );
            const text = container.textContent || "";
            expect(text).toContain("$1,000");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should handle currency at end of line", () => {
            const { container } = renderMessage("The amount is $1,000");
            const text = container.textContent || "";
            expect(text).toContain("$1,000");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should handle currency followed by punctuation", () => {
            const { container } = renderMessage(
                "Cost: $1,000. Profit: $500. Total: $1,500!",
            );
            const text = container.textContent || "";
            expect(text).toContain("$1,000");
            expect(text).toContain("$500");
            expect(text).toContain("$1,500");
            expect(text).not.toContain("«CURRENCY");
        });

        it("should not interpret currency placeholders as markdown", () => {
            // This test ensures placeholders like «CURRENCY0» don't get processed as markdown
            // If we used __CURRENCY_0__, markdown would interpret it as bold and break restoration
            const { container } = renderMessage(
                "Revenue: $40 million and $50 million in annual recurring revenue",
            );
            const text = container.textContent || "";
            expect(text).toContain("$40 million");
            expect(text).toContain("$50 million");
            // Verify placeholders are not visible (would be if markdown processed them)
            expect(text).not.toContain("«CURRENCY");
            expect(text).not.toContain("CURRENCY");
        });
    });
});
