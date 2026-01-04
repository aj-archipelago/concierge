import React, { createContext, useState, useEffect } from "react";
import axios from "axios";

const API_URL = "/wp-json/wp/v2/";

export const DataContext = createContext(null);

export const DataProvider = ({ children }) => {
    const [categories, setCategories] = useState([]);
    const [tags, setTags] = useState([]);
    const [where, setWhere] = useState([]);
    const [aiModules, setAiModules] = useState(null);
    const [apiUrl, setApiUrl] = useState(null);
    const [isInitialized, setIsInitialized] = useState(false);

    // Listen for init message from WordPress parent window
    useEffect(() => {
        console.log("🎬 DataProvider: Setting up __LABEEB_INIT__ listener...");

        const handleMessage = (event) => {
            if (event.data.type === "__LABEEB_INIT__") {
                console.log(
                    "✅ DataProvider: Received __LABEEB_INIT__ with config:",
                    event.data.config,
                );
                setAiModules(event.data.config);
                setApiUrl(event.data.apiUrl);
                setIsInitialized(true);

                // Also set globally for backward compatibility
                if (typeof window !== "undefined") {
                    window.AIModules = event.data.config;
                    window.arc_ai_editor_api_url = [event.data.apiUrl];
                }
            }
        };

        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);

    useEffect(() => {
        const fetchTaxonomyData = async (taxonomyName) => {
            let data = [];
            let page = 1;

            while (true) {
                const response = await axios.get(
                    `${API_URL}${taxonomyName}?per_page=100&page=${page}`,
                );
                data = data.concat(response.data);

                if (response.data.length < 100) {
                    break;
                }

                page++;
            }

            return data;
        };

        const fetchData = async () => {
            try {
                const categoriesData = await fetchTaxonomyData("categories");
                setCategories(categoriesData);

                const tagsData = await fetchTaxonomyData("tags");
                setTags(tagsData);

                const whereData = await fetchTaxonomyData("where");
                setWhere(whereData);
            } catch (error) {
                console.error(error);
            }
        };

        fetchData();
    }, []);

    return (
        <DataContext.Provider
            value={{
                categories,
                tags,
                where,
                aiModules,
                apiUrl,
                isInitialized,
            }}
        >
            {children}
        </DataContext.Provider>
    );
};
