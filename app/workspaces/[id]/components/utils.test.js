/**
 * @jest-environment node
 */

import {
    getMessagesUpToVersion,
    extractAndParseJson,
    completePartialJson,
    safeParseJson,
    cleanJsonCodeBlocks,
    extractHtmlFromStreamingContent,
    detectCodeBlockInStream,
    extractChatContent,
} from "./utils.js";

describe("Workspace Utils", () => {
    describe("getMessagesUpToVersion", () => {
        it("should return empty array for null/undefined messages", () => {
            expect(getMessagesUpToVersion(null, 1)).toEqual([]);
            expect(getMessagesUpToVersion(undefined, 1)).toEqual([]);
        });

        it("should return all messages when version not found", () => {
            const messages = [
                { id: 1, content: "msg1" },
                { id: 2, content: "msg2" },
            ];
            expect(getMessagesUpToVersion(messages, 5)).toEqual(messages);
        });

        it("should return messages up to the specified version", () => {
            const messages = [
                { id: 1, content: "msg1" },
                { id: 2, linkToVersion: 1, content: "msg2" },
                { id: 3, content: "msg3" },
                { id: 4, linkToVersion: 2, content: "msg4" },
            ];
            const result = getMessagesUpToVersion(messages, 1);
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(1);
            expect(result[1].id).toBe(2);
        });

        it("should find the last occurrence of the version", () => {
            const messages = [
                { id: 1, linkToVersion: 1, content: "msg1" },
                { id: 2, content: "msg2" },
                { id: 3, linkToVersion: 1, content: "msg3" },
                { id: 4, content: "msg4" },
            ];
            const result = getMessagesUpToVersion(messages, 1);
            expect(result).toHaveLength(3);
            expect(result[2].id).toBe(3);
        });
    });

    describe("extractAndParseJson", () => {
        it("should return null for invalid inputs", () => {
            expect(extractAndParseJson(null)).toBeNull();
            expect(extractAndParseJson(undefined)).toBeNull();
            expect(extractAndParseJson(123)).toBeNull();
            expect(extractAndParseJson({})).toBeNull();
        });

        it("should parse valid JSON without code blocks", () => {
            const json = '{"key": "value", "number": 123}';
            const result = extractAndParseJson(json);
            expect(result).toEqual({ key: "value", number: 123 });
        });

        it("should extract and parse JSON from ```json code blocks", () => {
            const content = '```json\n{"key": "value", "number": 123}\n```';
            const result = extractAndParseJson(content);
            expect(result).toEqual({ key: "value", number: 123 });
        });

        it("should extract and parse JSON from ``` code blocks", () => {
            const content = '```\n{"key": "value", "number": 123}\n```';
            const result = extractAndParseJson(content);
            expect(result).toEqual({ key: "value", number: 123 });
        });

        it("should handle whitespace around code blocks", () => {
            const content = '  ```json  \n  {"key": "value"}  \n  ```  ';
            const result = extractAndParseJson(content);
            expect(result).toEqual({ key: "value" });
        });

        it("should return null for invalid JSON in code blocks", () => {
            const content = '```json\n{"key": "value",}\n```';
            const result = extractAndParseJson(content);
            expect(result).toBeNull();
        });

        it("should return null for non-JSON content in code blocks", () => {
            const content = "```json\nThis is not JSON\n```";
            const result = extractAndParseJson(content);
            expect(result).toBeNull();
        });
    });

    describe("completePartialJson", () => {
        it("should return input for invalid inputs", () => {
            expect(completePartialJson(null)).toBeNull();
            expect(completePartialJson(undefined)).toBeUndefined();
            expect(completePartialJson(123)).toBe(123);
        });

        it("should complete partial JSON with missing closing braces", () => {
            const partial = '{"key": "value"';
            const result = completePartialJson(partial);
            expect(result).toBe('{"key": "value"}');
        });

        it("should complete partial JSON with missing closing brackets", () => {
            const partial = '["item1", "item2"';
            const result = completePartialJson(partial);
            expect(result).toBe('["item1", "item2"]');
        });

        it("should complete nested structures", () => {
            const partial = '{"key": {"nested": [1, 2';
            const result = completePartialJson(partial);
            expect(result).toBe('{"key": {"nested": [1, 2]}}');
        });

        it("should handle multiple nested structures", () => {
            const partial = '{"key": {"nested": [1, 2, {"deep": "value"';
            const result = completePartialJson(partial);
            expect(result).toBe(
                '{"key": {"nested": [1, 2, {"deep": "value"}]}}',
            );
        });

        it("should complete unclosed strings", () => {
            const partial = '{"key": "unclosed string';
            const result = completePartialJson(partial);
            expect(result).toBe('{"key": "unclosed string"}');
        });

        it("should handle escaped quotes in strings", () => {
            const partial = '{"key": "string with \\"quotes\\""';
            const result = completePartialJson(partial);
            expect(result).toBe('{"key": "string with \\"quotes\\""}');
        });

        it("should return complete JSON unchanged", () => {
            const complete = '{"key": "value"}';
            const result = completePartialJson(complete);
            expect(result).toBe(complete);
        });

        it("should handle complex nested structures", () => {
            const partial =
                '{"users": [{"name": "John", "age": 30, "hobbies": ["reading"';
            const result = completePartialJson(partial);
            expect(result).toBe(
                '{"users": [{"name": "John", "age": 30, "hobbies": ["reading"]}]}',
            );
        });
    });

    describe("safeParseJson", () => {
        it("should return null for invalid inputs", () => {
            expect(safeParseJson(null)).toBeNull();
            expect(safeParseJson(undefined)).toBeNull();
            expect(safeParseJson(123)).toBeNull();
        });

        it("should parse valid JSON directly", () => {
            const json = '{"key": "value"}';
            const result = safeParseJson(json);
            expect(result).toEqual({ key: "value" });
        });

        it("should complete and parse partial JSON", () => {
            const partial = '{"key": "value"';
            const result = safeParseJson(partial);
            expect(result).toEqual({ key: "value" });
        });

        it("should extract and parse JSON from code blocks", () => {
            const content = '```json\n{"key": "value"}\n```';
            const result = safeParseJson(content);
            expect(result).toEqual({ key: "value" });
        });

        it("should handle complex partial JSON with code blocks", () => {
            const content = '```json\n{"users": [{"name": "John"';
            const result = safeParseJson(content);
            expect(result).toBeNull();
        });

        it("should return null when all parsing attempts fail", () => {
            const invalid = "This is not JSON at all";
            const result = safeParseJson(invalid);
            expect(result).toBeNull();
        });
    });

    describe("cleanJsonCodeBlocks", () => {
        it("should return input for invalid inputs", () => {
            expect(cleanJsonCodeBlocks(null)).toBeNull();
            expect(cleanJsonCodeBlocks(undefined)).toBeUndefined();
            expect(cleanJsonCodeBlocks(123)).toBe(123);
        });

        it("should remove ```json code blocks", () => {
            const content = '```json\n{"key": "value"}\n```';
            const result = cleanJsonCodeBlocks(content);
            expect(result).toBe('{"key": "value"}');
        });

        it("should remove ``` code blocks", () => {
            const content = '```\n{"key": "value"}\n```';
            const result = cleanJsonCodeBlocks(content);
            expect(result).toBe('{"key": "value"}');
        });

        it("should remove multiple code blocks", () => {
            const content =
                '```json\n{"key1": "value1"}\n```\n```\n{"key2": "value2"}\n```';
            const result = cleanJsonCodeBlocks(content);
            expect(result).toBe('{"key1": "value1"}\n{"key2": "value2"}');
        });

        it("should handle content without code blocks", () => {
            const content = "This is plain text";
            const result = cleanJsonCodeBlocks(content);
            expect(result).toBe(content);
        });

        it("should handle whitespace around code blocks", () => {
            const content = '  ```json  \n  {"key": "value"}  \n  ```  ';
            const result = cleanJsonCodeBlocks(content);
            expect(result).toBe('{"key": "value"}');
        });
    });

    describe("extractHtmlFromStreamingContent", () => {
        it("should return null for invalid inputs", () => {
            expect(extractHtmlFromStreamingContent(null)).toBeNull();
            expect(extractHtmlFromStreamingContent(undefined)).toBeNull();
            expect(extractHtmlFromStreamingContent(123)).toBeNull();
        });

        it("should extract HTML from ```html code blocks", () => {
            const content = "```html\n<div>Hello World</div>\n```";
            const result = extractHtmlFromStreamingContent(content);
            expect(result).toEqual({
                html: "<div>Hello World</div>",
                changes: "HTML code generated from code block",
                isComplete: true,
            });
        });

        it("should extract HTML from ``` code blocks", () => {
            const content = "```\n<div>Hello World</div>\n```";
            const result = extractHtmlFromStreamingContent(content);
            expect(result).toEqual({
                html: "<div>Hello World</div>",
                changes: "HTML code generated from code block",
                isComplete: true,
            });
        });

        it("should use the last code block when multiple exist", () => {
            const content =
                "```html\n<div>First</div>\n```\n```html\n<div>Second</div>\n```";
            const result = extractHtmlFromStreamingContent(content);
            expect(result).toEqual({
                html: "<div>Second</div>",
                changes: "HTML code generated from code block",
                isComplete: true,
            });
        });

        it("should handle whitespace in code blocks", () => {
            const content = "```html\n  <div>Hello World</div>  \n```";
            const result = extractHtmlFromStreamingContent(content);
            expect(result).toEqual({
                html: "<div>Hello World</div>",
                changes: "HTML code generated from code block",
                isComplete: true,
            });
        });

        it("should return null for empty code blocks", () => {
            const content = "```html\n\n```";
            const result = extractHtmlFromStreamingContent(content);
            expect(result).toBeNull();
        });

        it("should return null when no code blocks found", () => {
            const content = "This is plain text without code blocks";
            const result = extractHtmlFromStreamingContent(content);
            expect(result).toBeNull();
        });

        it("should handle complex HTML content", () => {
            const content =
                "```html\n<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body><h1>Hello</h1></body>\n</html>\n```";
            const result = extractHtmlFromStreamingContent(content);
            expect(result.html).toContain("<!DOCTYPE html>");
            expect(result.html).toContain("<html>");
            expect(result.html).toContain("<h1>Hello</h1>");
        });
    });

    describe("detectCodeBlockInStream", () => {
        it("should return null for invalid inputs", () => {
            expect(detectCodeBlockInStream(null)).toBeNull();
            expect(detectCodeBlockInStream(undefined)).toBeNull();
            expect(detectCodeBlockInStream(123)).toBeNull();
        });

        it("should detect complete code blocks", () => {
            const content = "```html\n<div>Hello</div>\n```";
            const result = detectCodeBlockInStream(content);
            expect(result).toEqual({
                html: "<div>Hello</div>",
                isInCodeBlock: true,
                changes: "HTML code being generated...",
                isComplete: false,
                chatContent:
                    "**Generating applet code...**\n**Generating applet code...**",
            });
        });

        it("should detect incomplete code blocks", () => {
            const content = "```html\n<div>Hello";
            const result = detectCodeBlockInStream(content);
            expect(result).toEqual({
                html: "<div>Hello",
                isInCodeBlock: true,
                changes: "HTML code being generated...",
                isComplete: false,
                chatContent: "**Generating applet code...**",
            });
        });

        it("should handle mixed content with code blocks", () => {
            const content =
                "Here is some explanation.\n```html\n<div>Hello</div>\n```\nAnd more text.";
            const result = detectCodeBlockInStream(content);
            expect(result).toEqual({
                html: "<div>Hello</div>\nAnd more text.",
                isInCodeBlock: true,
                changes: "HTML code being generated...",
                isComplete: false,
                chatContent:
                    "Here is some explanation.\n**Generating applet code...**\n**Generating applet code...**",
            });
        });

        it("should handle incomplete code blocks with chat content", () => {
            const content = "Here is the explanation.\n```html\n<div>Hello";
            const result = detectCodeBlockInStream(content);
            expect(result).toEqual({
                html: "<div>Hello",
                isInCodeBlock: true,
                changes: "HTML code being generated...",
                isComplete: false,
                chatContent:
                    "Here is the explanation.\n**Generating applet code...**",
            });
        });

        it("should handle multiple code blocks", () => {
            const content =
                "```html\n<div>First</div>\n```\n```html\n<div>Second</div>";
            const result = detectCodeBlockInStream(content);
            expect(result).toEqual({
                html: "<div>First</div>\n<div>Second</div>",
                isInCodeBlock: true,
                changes: "HTML code being generated...",
                isComplete: false,
                chatContent:
                    "**Generating applet code...**\n**Generating applet code...**\n**Generating applet code...**",
            });
        });

        it("should return null when no code blocks detected", () => {
            const content = "This is plain text without any code blocks";
            const result = detectCodeBlockInStream(content);
            expect(result).toBeNull();
        });

        it("should handle empty code blocks", () => {
            const content = "```html\n\n```";
            const result = detectCodeBlockInStream(content);
            expect(result).toBeNull();
        });

        it("should handle code blocks with only whitespace", () => {
            const content = "```html\n   \n```";
            const result = detectCodeBlockInStream(content);
            expect(result).toBeNull();
        });

        it("should handle complex streaming scenarios", () => {
            const content =
                "Let me create a simple HTML page for you.\n```html\n<!DOCTYPE html>\n<html>\n<head>\n<title>My Page</title>\n</head>\n<body>\n<h1>Welcome</h1>\n<p>This is a paragraph.</p>";
            const result = detectCodeBlockInStream(content);
            expect(result).toEqual({
                html: "<!DOCTYPE html>\n<html>\n<head>\n<title>My Page</title>\n</head>\n<body>\n<h1>Welcome</h1>\n<p>This is a paragraph.</p>",
                isInCodeBlock: true,
                changes: "HTML code being generated...",
                isComplete: false,
                chatContent:
                    "Let me create a simple HTML page for you.\n**Generating applet code...**",
            });
        });
    });

    describe("extractChatContent", () => {
        it("should return input for invalid inputs", () => {
            expect(extractChatContent(null)).toBeNull();
            expect(extractChatContent(undefined)).toBeUndefined();
            expect(extractChatContent(123)).toBe(123);
        });

        it("should replace code blocks with placeholders", () => {
            const content =
                "Here is the explanation.\n```html\n<div>Hello</div>\n```\nAnd more text.";
            const result = extractChatContent(content);
            expect(result).toBe(
                "Here is the explanation.\n**Applet code generated and applied.**\nAnd more text.",
            );
        });

        it("should handle multiple code blocks", () => {
            const content =
                "```html\n<div>First</div>\n```\n```html\n<div>Second</div>\n```";
            const result = extractChatContent(content);
            expect(result).toBe(
                "**Applet code generated and applied.**\n**Applet code generated and applied.**",
            );
        });

        it("should handle content without code blocks", () => {
            const content = "This is plain text without code blocks";
            const result = extractChatContent(content);
            expect(result).toBe(content);
        });

        it("should handle empty content", () => {
            const content = "";
            const result = extractChatContent(content);
            expect(result).toBe("");
        });

        it("should handle content with only code blocks", () => {
            const content = "```html\n<div>Hello</div>\n```";
            const result = extractChatContent(content);
            expect(result).toBe("**Applet code generated and applied.**");
        });

        it("should handle whitespace around code blocks", () => {
            const content = "  ```html\n  <div>Hello</div>\n  ```  ";
            const result = extractChatContent(content);
            expect(result).toBe("**Applet code generated and applied.**");
        });

        it("should handle complex content with mixed code blocks", () => {
            const content =
                "First explanation.\n```html\n<div>First</div>\n```\nSecond explanation.\n```html\n<div>Second</div>\n```\nFinal text.";
            const result = extractChatContent(content);
            expect(result).toBe(
                "First explanation.\n**Applet code generated and applied.**\nSecond explanation.\n**Applet code generated and applied.**\nFinal text.",
            );
        });

        it("should return original content if nothing remains after replacement", () => {
            const content = "```html\n<div>Hello</div>\n```";
            const result = extractChatContent(content);
            expect(result).toBe("**Applet code generated and applied.**");
        });
    });

    describe("APPLET tag parsing - extractHtmlFromStreamingContent", () => {
        it("should extract HTML from complete APPLET tag", () => {
            const content = "<APPLET><div>Hello World</div></APPLET>";
            const result = extractHtmlFromStreamingContent(content);
            expect(result).toEqual({
                html: "<div>Hello World</div>",
                changes: "HTML code generated from APPLET tag",
                isComplete: true,
            });
        });

        it("should extract HTML from APPLET tag with markdown code block inside", () => {
            const content =
                "<APPLET>```html\n<div>Hello World</div>\n```</APPLET>";
            const result = extractHtmlFromStreamingContent(content);
            expect(result).toEqual({
                html: "<div>Hello World</div>",
                changes: "HTML code generated from APPLET tag",
                isComplete: true,
            });
        });

        it("should extract HTML from APPLET tag with leading/trailing whitespace", () => {
            const content =
                "<APPLET> <!DOCTYPE html>\n<html><body>Test</body></html> </APPLET>";
            const result = extractHtmlFromStreamingContent(content);
            expect(result.html.trim()).toContain("<!DOCTYPE html>");
            expect(result.html.trim()).toContain("<html>");
        });

        it("should handle APPLET tag with attributes", () => {
            const content = '<APPLET id="test"><div>Hello</div></APPLET>';
            const result = extractHtmlFromStreamingContent(content);
            expect(result.html).toBe("<div>Hello</div>");
        });

        it("should use last code block when multiple exist inside APPLET", () => {
            const content =
                "<APPLET>```html\n<div>First</div>\n```\n```html\n<div>Second</div>\n```</APPLET>";
            const result = extractHtmlFromStreamingContent(content);
            expect(result.html).toBe("<div>Second</div>");
        });

        it("should handle APPLET tag case-insensitively", () => {
            const content = "<applet><div>Hello</div></applet>";
            const result = extractHtmlFromStreamingContent(content);
            expect(result.html).toBe("<div>Hello</div>");
        });

        it("should return null for empty APPLET tag", () => {
            const content = "<APPLET></APPLET>";
            const result = extractHtmlFromStreamingContent(content);
            expect(result).toBeNull();
        });

        it("should fall back to code blocks if no APPLET tag found", () => {
            const content = "```html\n<div>Hello</div>\n```";
            const result = extractHtmlFromStreamingContent(content);
            expect(result.html).toBe("<div>Hello</div>");
        });
    });

    describe("APPLET tag parsing - detectCodeBlockInStream", () => {
        it("should detect complete APPLET tag", () => {
            const content = "<APPLET><div>Hello</div></APPLET>";
            const result = detectCodeBlockInStream(content);
            expect(result).toEqual({
                html: "<div>Hello</div>",
                isInCodeBlock: false,
                changes: "HTML code being generated...",
                isComplete: true,
                chatContent: null,
            });
        });

        it("should detect incomplete APPLET tag (streaming)", () => {
            const content = "<APPLET><div>Hello";
            const result = detectCodeBlockInStream(content);
            expect(result).toEqual({
                html: "<div>Hello",
                isInCodeBlock: true,
                changes: "HTML code being generated...",
                isComplete: false,
                chatContent: null,
            });
        });

        it("should detect APPLET tag with markdown code block inside", () => {
            const content = "<APPLET>```html\n<div>Hello</div>\n```</APPLET>";
            const result = detectCodeBlockInStream(content);
            expect(result.html).toBe("<div>Hello</div>");
            expect(result.isComplete).toBe(true);
        });

        it("should handle APPLET tag with content before it", () => {
            const content =
                "Here's the applet: <APPLET><div>Hello</div></APPLET>";
            const result = detectCodeBlockInStream(content);
            expect(result.html).toBe("<div>Hello</div>");
            expect(result.chatContent).toBe("Here's the applet:");
        });

        it("should handle streaming APPLET tag with content before it", () => {
            const content = "Here's the applet: <APPLET><div>Hello";
            const result = detectCodeBlockInStream(content);
            expect(result.html).toBe("<div>Hello");
            expect(result.isInCodeBlock).toBe(true);
            expect(result.chatContent).toBe("Here's the applet:");
        });

        it("should handle APPLET tag with whitespace after opening tag", () => {
            const content =
                "<APPLET> <!DOCTYPE html><html><body>Test</body></html></APPLET>";
            const result = detectCodeBlockInStream(content);
            expect(result.html.trim()).toContain("<!DOCTYPE html>");
        });

        it("should handle APPLET tag with attributes", () => {
            const content =
                '<APPLET id="test" class="app"><div>Hello</div></APPLET>';
            const result = detectCodeBlockInStream(content);
            expect(result.html).toBe("<div>Hello</div>");
        });

        it("should handle case-insensitive APPLET tags", () => {
            const content = "<applet><div>Hello</div></applet>";
            const result = detectCodeBlockInStream(content);
            expect(result.html).toBe("<div>Hello</div>");
        });

        it("should handle streaming markdown code block inside APPLET tag", () => {
            const content = "<APPLET>```html\n<div>Hello";
            const result = detectCodeBlockInStream(content);
            expect(result.html).toBe("<div>Hello");
            expect(result.isInCodeBlock).toBe(true);
        });

        it("should handle complex HTML in streaming APPLET tag", () => {
            const content =
                "<APPLET><!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body><h1>Hello";
            const result = detectCodeBlockInStream(content);
            expect(result.html).toContain("<!DOCTYPE html>");
            expect(result.html).toContain("<html>");
            expect(result.isInCodeBlock).toBe(true);
        });

        it("should return null when no APPLET tag and no code block", () => {
            const content = "This is plain text";
            const result = detectCodeBlockInStream(content);
            expect(result).toBeNull();
        });

        it("should fall back to code block detection if no APPLET tag", () => {
            const content = "```html\n<div>Hello</div>\n```";
            const result = detectCodeBlockInStream(content);
            expect(result.html).toBe("<div>Hello</div>");
        });

        it("should handle APPLET tag starting with whitespace", () => {
            const content = "<APPLET> <div>Hello</div></APPLET>";
            const result = detectCodeBlockInStream(content);
            expect(result.html.trim()).toBe("<div>Hello</div>");
        });

        it("should handle APPLET tag with space and DOCTYPE (user reported case)", () => {
            const content =
                '<APPLET> <!DOCTYPE html> <html lang="en"> <head> <meta charset="UTF-8">';
            const result = detectCodeBlockInStream(content);
            expect(result).not.toBeNull();
            expect(result.html.trim()).toContain("<!DOCTYPE html>");
            expect(result.html.trim()).toContain("<html");
            expect(result.isInCodeBlock).toBe(true);
        });

        it("should handle multiple APPLET tags (use first)", () => {
            const content =
                "<APPLET><div>First</div></APPLET><APPLET><div>Second</div></APPLET>";
            const result = detectCodeBlockInStream(content);
            // Should match the first APPLET tag
            expect(result.html).toBe("<div>First</div>");
        });
    });

    describe("APPLET tag parsing - extractChatContent", () => {
        it("should replace APPLET tag with placeholder", () => {
            const content =
                "Here's the applet: <APPLET><div>Hello</div></APPLET>";
            const result = extractChatContent(content);
            expect(result).toBe(
                "Here's the applet: **Applet code generated and applied.**",
            );
        });

        it("should handle APPLET tag with markdown inside", () => {
            const content = "<APPLET>```html\n<div>Hello</div>\n```</APPLET>";
            const result = extractChatContent(content);
            expect(result).toBe("**Applet code generated and applied.**");
        });

        it("should handle case-insensitive APPLET tags", () => {
            const content = "<applet><div>Hello</div></applet>";
            const result = extractChatContent(content);
            expect(result).toBe("**Applet code generated and applied.**");
        });

        it("should handle content with both APPLET and code blocks", () => {
            const content =
                "Text before <APPLET><div>Hello</div></APPLET> and ```html\n<div>Code</div>\n``` after";
            const result = extractChatContent(content);
            expect(result).toBe(
                "Text before **Applet code generated and applied.** and **Applet code generated and applied.** after",
            );
        });
    });
});
