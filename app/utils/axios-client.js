import axios from "axios";

// Create base axios instance
const axiosInstance = axios.create();

// Add interceptors only for client-side
if (typeof window !== "undefined") {
    axiosInstance.interceptors.response.use(
        function (response) {
            if (response.headers["content-type"]?.includes("text/html")) {
                triggerReauth();
            }
            return response;
        },
        function (error) {
            if (error.response?.status === 401) {
                triggerReauth();
            }
            return Promise.reject(error);
        },
    );
}

function triggerReauth() {
    if (window.location.search.indexOf("reauth=true") !== -1) {
        return;
    }

    window.location.href =
        window.location.pathname +
        window.location.search +
        (window.location.search ? "&" : "?") +
        "reauth=true";
}

export default axiosInstance;
