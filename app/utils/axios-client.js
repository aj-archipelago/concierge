import axios from "axios";

// This client handles auth timeouts and should be used to make all API requests on the client side
// (but not on the server side, where we don't have access to the window object)
const axiosClient = axios.create();

axiosClient.interceptors.response.use(
    function (response) {
        // Any status code that lie within the range of 2xx cause this function to trigger

        // check if response content type is html
        if (response.headers["content-type"]?.includes("text/html")) {
            triggerReauth();
        }

        return response;
    },
    function (error) {
        // Any status codes that falls outside the range of 2xx cause this function to trigger
        // Do something with response error

        // check if error code is 401
        if (error.response?.status === 401) {
            triggerReauth();
        }

        return Promise.reject(error);
    },
);

function triggerReauth() {
    if (typeof window === "undefined") {
        return;
    }

    // prevent infinite reload loop in non-entra scenarios
    if (window.location.search.indexOf("reauth=true") !== -1) {
        return;
    }

    // redirect to current path + query string reauth=true
    window.location.href =
        window.location.pathname +
        window.location.search +
        (window.location.search ? "&" : "?") +
        "reauth=true";
}

export default axiosClient;
