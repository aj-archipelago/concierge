export const AJE = "665003303001";
export const AJA = "665001584001";
export const getAxisUrl = (accountId, searchQuery) =>
    `https://axis.aljazeera.net/brightcove/playback/media/v1.0/${accountId}/videos?format=json&q=${encodeURIComponent(searchQuery)}`;

export const fetchUrlSource = async (url) => {
    const response = await fetch(
        `/api/urlsource?url=${encodeURIComponent(url)}`,
    );
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
};
