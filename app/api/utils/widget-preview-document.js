import { load } from "cheerio";

export const WIDGET_PREVIEW_ORIGIN = "https://widget-preview.invalid";
export const WIDGET_TAILWIND_URL =
    "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4/dist/index.global.js";

/** Same host geometry/theme/locale contract, with an inert SDK and no credentials. */
export function widgetPreviewDocument(html, { theme, language, width }) {
    const $ = load(html);
    const direction = language === "ar" ? "rtl" : "ltr";
    $("base,iframe,frame,object,embed,meta[http-equiv],link").remove();
    $("script[src]").remove();
    $("html").attr({ "data-theme": theme, lang: language, dir: direction });
    const bootstrap = `
window.CONCIERGE_LANGUAGE=${JSON.stringify(language)};
window.CONCIERGE_DIRECTION=${JSON.stringify(direction)};
window.APPLET_PARAMS={};
const locale=()=>({language:window.CONCIERGE_LANGUAGE,direction:window.CONCIERGE_DIRECTION});
const unavailable=async()=>{throw new Error('Preview: live action unavailable')};
const namespace=new Proxy({}, {get:()=>unavailable});
window.ConciergeSDK=new Proxy({
 locale:{get:locale,getLanguage:()=>locale().language,getDirection:()=>locale().direction,isRtl:()=>locale().direction==='rtl'},
 data:{get:async()=>({found:false}),set:unavailable},
 media:new Proxy({ensureImage:async()=>({url:null})},{get:(target,key)=>target[key]||unavailable}),
 agent:{chat:unavailable,render:()=>{}},
 ready:Promise.resolve(),
}, {get:(target,key)=>target[key]||namespace});
window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;window.open=()=>null;
`;
    $("head").prepend(
        `<meta charset="utf-8"><meta name="viewport" content="width=${width}, initial-scale=1"><script>${bootstrap}</script><style>
html,body{margin:0;padding:0;width:100%}html{height:auto}body{font-family:system-ui,-apple-system,sans-serif;min-height:auto;height:auto;background:#fff}
html[data-theme="dark"] body{background-color:#1f2937}html[data-theme="dark"]{color-scheme:dark}html[data-theme="light"]{color-scheme:light}img{max-width:100%;height:auto}
</style><script src="${WIDGET_TAILWIND_URL}"></script>`,
    );
    // Defense in depth: even fetch, images, CSS imports, forms and workers cannot
    // contact the network. The sole script URL is served from a trusted local copy.
    $("head").prepend(
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">`,
    );
    return $.html();
}
