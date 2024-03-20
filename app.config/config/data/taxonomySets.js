import axios from "axios";
const URLS = {
    aja: "https://wordpress.aljazeera.net",
    aje: "https://wordpress.aljazeera.com",
};

const API_URL = "/wp-json/wp/v2/";

// get taxonomy data from the WP API
const fetchTaxonomyData = async (site, taxonomyName) => {
    let data = [];
    let page = 1;

    while (true) {
        const response = await axios.get(
            `${URLS[site]}${API_URL}${taxonomyName}?per_page=100&page=${page}`,
        );
        data = data.concat(response.data);

        if (response.data.length < 100) {
            break;
        }

        page++;
    }

    return data;
};

let taxonomySets;

export async function initializeTaxonomies() {
    const taxonomySetsContext = require.context(
        "./taxonomy-sets",
        false,
        /\.json$/,
    );

    let dedupedFileNames = [];

    taxonomySets = taxonomySetsContext
        .keys()
        .map((filename) => {
            const filenameOnly = filename.split("/").pop();

            // This is needed because the require.context keys
            // will include the same file with two paths:
            // ./filename.json and <absolute-path>/filename.json
            if (dedupedFileNames.includes(filenameOnly)) {
                return;
            }

            const setName = filename.slice(2, -5); // Remove './' and '.json' from the file name
            const content = taxonomySetsContext(filename);

            dedupedFileNames.push(filenameOnly);
            return { setName, ...content };
        })
        .filter(Boolean)
        .concat([
            {
                name: "Al Jazeera Arabic",
                setName: "aljazeera_arabic",
                categories: (await fetchTaxonomyData("aja", "categories")).map(
                    (c) => c.name,
                ),
                tags: (await fetchTaxonomyData("aja", "tags")).map(
                    (c) => c.name,
                ),
            },
            {
                name: "Al Jazeera English",
                setName: "aljazeera_english",
                categories: (await fetchTaxonomyData("aje", "categories")).map(
                    (c) => c.name,
                ),
                tags: (await fetchTaxonomyData("aje", "tags")).map(
                    (c) => c.name,
                ),
            },
        ]);
};

export const getTaxonomySets = async function () {
    return taxonomySets;
};

export const getTopics = async function (language) {
    if (language === "ar") {
        return taxonomySets?.find((set) => set.setName === "aljazeera_arabic")
            ?.categories;
    }
    return taxonomySets?.find((set) => set.setName === "aljazeera_english")
        ?.categories;
};

export const getTags = async function (language) {
    if (language === "ar") {
        return taxonomySets?.find((set) => set.setName === "aljazeera_arabic")
            ?.tags;
    }
    return taxonomySets?.find((set) => set.setName === "aljazeera_english")
        ?.tags;
};
