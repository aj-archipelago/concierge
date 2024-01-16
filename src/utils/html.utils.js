export function stripHTML(html) {
    var tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    const text = (tmp.textContent || tmp.innerText || "")
        .split("\n")
        .filter((paragraph) => paragraph.trim().length > 0)
        .join("\n\n");
    return text;
}
