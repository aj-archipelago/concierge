/** Shared selection policy for every default applet builder surface. */
export const APPLET_API_SELECTION = `## Choose the API before building

| Applet needs | Use |
|---|---|
| Rewrite, translate, classify, or summarise supplied text | \`ConciergeSDK.models.executePrompt()\` |
| The user's personal agent, tools, connectors, or memory | \`ConciergeSDK.agent.chat()\` |
| Records, headlines, counts, or dashboard data | An appropriate data/search API, not an answer-generation pipeline |

If the needed data/search API is unavailable, surface that gap. Use only documented SDK APIs. Do not substitute an internal answer-generation service or route simple transformations through the personal agent.
`;
