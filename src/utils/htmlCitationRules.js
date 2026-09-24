export const HTML_CITATION_RULES = `HTML CITATIONS:
- Cite sourced claims with ordinary HTML links: a linked source name beside the claim, or numbered links to a Sources section containing the actual source URLs.
- Copy URLs from the supplied source records. Never invent a destination or turn a searchResultId into a URL. Escape attribute values. If a source has no usable URL, give its supplied title and say the link is unavailable.
- Do not put :cd_source[...] directives or Markdown link syntax in displayed HTML prose. Literal code examples are allowed.
- Keep source links readable in light/dark themes, keyboard accessible, and correctly ordered in RTL. A compact widget should cite only the claims it displays.`;
