// Runs inside an isolated browser. Keep this function self-contained.
export function measureWidgetPreview({ language, direction }) {
    const issues = [];
    const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.clipPath !== "inset(50%)" &&
            !/^rect\(0px[, ]+0px[, ]+0px[, ]+0px\)$/.test(style.clip) &&
            Number(style.opacity) !== 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    };
    const label = (element) =>
        (
            element.getAttribute("aria-label") ||
            element.getAttribute("placeholder") ||
            element.textContent ||
            element.tagName
        )
            .trim()
            .slice(0, 70);
    const add = (code, element, detail) => {
        if (issues.length < 24)
            issues.push({ code, element: label(element), detail });
    };
    const elements = [...document.body.querySelectorAll("*")].filter(visible);
    const controls = elements.filter((el) =>
        el.matches(
            "button,input:not([type=hidden]),textarea,select,a[href],[role=button]",
        ),
    );
    if (getComputedStyle(document.body).direction !== direction)
        add("direction", document.body, `Expected ${direction}`);
    const copy = [
        ...controls.map(label),
        ...elements.filter((el) => el.children.length === 0).map(label),
    ].join(" ");
    const displayedCopy = elements
        .filter(
            (el) =>
                el.children.length === 0 &&
                !el.closest("pre,code,script,style"),
        )
        .map((el) => el.textContent || "")
        .join(" ");
    if (/:cd_source\s*\[/i.test(displayedCopy))
        add(
            "citation-format",
            document.body,
            "Displayed HTML contains unresolved citation markers; use actual source links",
        );
    if (language === "ar" && !/[\u0600-\u06ff]/.test(copy))
        add(
            "translation",
            document.body,
            "Arabic preview contains no Arabic interface text",
        );
    if (
        document.documentElement.scrollWidth > window.innerWidth + 2 ||
        document.body.scrollWidth > window.innerWidth + 2
    )
        add("page-overflow", document.body, "Page scrolls horizontally");
    if (document.documentElement.scrollHeight > window.innerHeight + 2)
        add(
            "page-overflow",
            document.body,
            "Content exceeds the 320px tile height",
        );
    const rgba = (value) => {
        const m = value.match(/^rgba?\(([^)]+)\)$/);
        return m
            ? m[1]
                  .split(/[,\s/]+/)
                  .filter(Boolean)
                  .map(Number)
            : null;
    };
    const background = (el) => {
        let result = [255, 255, 255];
        const chain = [];
        for (let node = el; node; node = node.parentElement)
            chain.unshift(node);
        for (const node of chain) {
            const s = getComputedStyle(node);
            if (s.backgroundImage !== "none") return null; // Visual review handles images/gradients.
            const c = rgba(s.backgroundColor);
            if (c)
                result = result.map(
                    (v, i) => c[i] * (c[3] ?? 1) + v * (1 - (c[3] ?? 1)),
                );
        }
        return result;
    };
    const luminance = (c) =>
        c
            .slice(0, 3)
            .map((n) => {
                const v = n / 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (el, style, kind) => {
        const fg = rgba(style.color),
            bg = background(el);
        if (!fg || !bg) return;
        const color = fg.map((v, i) =>
            i < 3 ? v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)) : v,
        );
        const a = luminance(color),
            b = luminance(bg);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const large =
            parseFloat(style.fontSize) >= 24 ||
            (parseFloat(style.fontSize) >= 18.66 &&
                Number(style.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5))
            add("contrast", el, `${kind} contrast ${ratio.toFixed(1)}:1`);
    };
    for (const el of elements) {
        const text = [...el.childNodes].some(
            (node) =>
                node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
        );
        if (text && !el.closest("svg,script,style")) {
            const s = getComputedStyle(el);
            if (parseFloat(s.fontSize) < 12)
                add("small-text", el, `${s.fontSize} text`);
            if (
                el.children.length === 0 &&
                /hidden|clip/.test(s.overflowX) &&
                el.scrollWidth > el.clientWidth + 2
            )
                add(
                    "clipped-text",
                    el,
                    "Visible copy is truncated; shorten it or let it wrap",
                );
            contrast(el, s, "Text");
        }
        if (el.matches("input[placeholder],textarea[placeholder]"))
            contrast(el, getComputedStyle(el, "::placeholder"), "Placeholder");
    }
    for (const el of controls) {
        if (el.tagName === "SELECT") {
            const style = getComputedStyle(el);
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const paddingStart = parseFloat(
                style.direction === "rtl"
                    ? style.paddingRight
                    : style.paddingLeft,
            );
            const paddingEnd = parseFloat(
                style.direction === "rtl"
                    ? style.paddingLeft
                    : style.paddingRight,
            );
            const available =
                el.clientWidth - paddingStart - Math.max(paddingEnd, 24);
            const clipped = [...el.options].find(
                (option) =>
                    context.measureText(option.textContent).width >
                    available + 2,
            );
            if (clipped)
                add(
                    "clipped-option",
                    el,
                    `Selected option would be truncated: ${clipped.textContent}`,
                );
        }
        const rect = el.getBoundingClientRect();
        let left = 0,
            top = 0,
            right = window.innerWidth,
            bottom = window.innerHeight;
        for (let p = el.parentElement; p; p = p.parentElement) {
            const s = getComputedStyle(p),
                r = p.getBoundingClientRect();
            if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) {
                left = Math.max(left, r.left);
                right = Math.min(right, r.right);
            }
            if (/(hidden|clip|auto|scroll)/.test(s.overflowY)) {
                top = Math.max(top, r.top);
                bottom = Math.min(bottom, r.bottom);
            }
        }
        if (
            rect.left < left - 2 ||
            rect.right > right + 2 ||
            rect.top < top - 2 ||
            rect.bottom > bottom + 2
        )
            add(
                "clipped-control",
                el,
                "Control is outside the tile or a clipped/scrolling ancestor",
            );
        if (rect.width < 40 || rect.height < 40)
            add(
                "small-target",
                el,
                `${Math.round(rect.width)}×${Math.round(rect.height)} target; minimum 40px`,
            );
        if (
            !label(el) ||
            (!el.textContent.trim() &&
                !el.getAttribute("aria-label") &&
                !el.labels?.length &&
                !el.getAttribute("title"))
        )
            add(
                "accessible-name",
                el,
                "Control needs a visible label or aria-label",
            );
    }
    return { issues, text: copy.slice(0, 400) };
}
