import { normalizeMermaidSvgForDarkTheme } from "../mermaidThemeUtils";

describe("normalizeMermaidSvgForDarkTheme", () => {
    it("switches node labels to dark text when the node fill is light", () => {
        const input = `
            <svg xmlns="http://www.w3.org/2000/svg">
              <g class="node">
                <rect fill="#dbeafe" />
                <g class="label">
                  <text fill="#ffffff">Hello</text>
                </g>
              </g>
            </svg>
        `;

        const output = normalizeMermaidSvgForDarkTheme(input);

        expect(output).toContain('fill="#0f172a"');
    });

    it("keeps labels light when the node fill is dark", () => {
        const input = `
            <svg xmlns="http://www.w3.org/2000/svg">
              <g class="node">
                <rect fill="#172033" />
                <g class="label">
                  <text fill="#ffffff">Hello</text>
                </g>
              </g>
            </svg>
        `;

        const output = normalizeMermaidSvgForDarkTheme(input);

        expect(output).toContain('fill="#f8fafc"');
    });

    it("recolors html labels inside foreignObject nodes", () => {
        const input = `
            <svg xmlns="http://www.w3.org/2000/svg">
              <g class="node">
                <rect fill="#fde68a" />
                <foreignObject>
                  <div xmlns="http://www.w3.org/1999/xhtml">
                    <span>Hello</span>
                  </div>
                </foreignObject>
              </g>
            </svg>
        `;

        const output = normalizeMermaidSvgForDarkTheme(input);

        expect(output).toContain("color:#0f172a");
        expect(output).toContain("fill:#0f172a");
    });

    it("detects fill colors from inline styles that use !important", () => {
        const input = `
            <svg xmlns="http://www.w3.org/2000/svg">
              <g class="node">
                <rect style="fill:#b3f0ff !important;stroke:#333 !important" />
                <foreignObject>
                  <div xmlns="http://www.w3.org/1999/xhtml">
                    <span>Hello</span>
                  </div>
                </foreignObject>
              </g>
            </svg>
        `;

        const output = normalizeMermaidSvgForDarkTheme(input);

        expect(output).toContain("color:#0f172a !important");
        expect(output).toContain("fill:#0f172a !important");
    });
});
