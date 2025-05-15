import axios from "../../../app/utils/axios-client";

const URLS = {
    aja: "https://wordpress.aljazeera.net",
    aje: "https://wordpress.aljazeera.com",
};

const API_URL = "/wp-json/wp/v2/";

// initialize only on client side since the server
// does not have access to the vpn
if (typeof window !== "undefined") {
    initializeTaxonomies();
}

// get taxonomy data from the WP API
async function fetchTaxonomyData(site, taxonomyName) {
    let data = [];
    let page = 1;

    while (true) {
        try {
            const response = await axios.get(
                `${URLS[site]}${API_URL}${taxonomyName}?per_page=100&page=${page}`,
            );
            data = data.concat(response.data);

            if (response.data.length < 100) {
                break;
            }

            page++;
        } catch (error) {
            taxonomyDownloadError = error;
            if (error.code === "ERR_NETWORK") {
                taxonomyDownloadError = new Error("vpn_connection_error");
            }
            break;
        }
    }

    return data;
}

let taxonomySets;
let taxonomyDownloadError;

export async function initializeTaxonomies() {
    // Import all JSON files explicitly
    const [ajplusArabic, ajplusEspanol, ajplusFrancais] = await Promise.all([
        import("./taxonomy-sets/ajplus_arabic.json"),
        import("./taxonomy-sets/ajplus_espanol.json"),
        import("./taxonomy-sets/ajplus_francais.json"),
    ]);

    taxonomySets = [
        { setName: "ajplus_arabic", ...ajplusArabic.default },
        { setName: "ajplus_espanol", ...ajplusEspanol.default },
        { setName: "ajplus_francais", ...ajplusFrancais.default },
        {
            name: "Al Jazeera Arabic",
            setName: "aljazeera_arabic",
            categories: (await fetchTaxonomyData("aja", "categories")).map(
                (c) => c.name,
            ),
            tags: (await fetchTaxonomyData("aja", "tags")).map((c) => c.name),
        },
        {
            name: "Al Jazeera English",
            setName: "aljazeera_english",
            categories: (await fetchTaxonomyData("aje", "categories")).map(
                (c) => c.name,
            ),
            tags: (await fetchTaxonomyData("aje", "tags")).map((c) => c.name),
        },
    ];
}

export const getTaxonomySets = async () => {
    if (taxonomyDownloadError) {
        throw taxonomyDownloadError;
    }

    return taxonomySets;
};

export const getTopics = async (language) => {
    if (language === "ar") {
        return taxonomySets?.find((set) => set.setName === "aljazeera_arabic")
            ?.categories;
    }
    return taxonomySets?.find((set) => set.setName === "aljazeera_english")
        ?.categories;
};

export const getTags = async (language) => {
    if (language === "ar") {
        return taxonomySets?.find((set) => set.setName === "aljazeera_arabic")
            ?.tags;
    }
    return taxonomySets?.find((set) => set.setName === "aljazeera_english")
        ?.tags;
};
