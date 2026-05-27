/**
 * =============================================================================
 * Concierge Applet SDK v1.8.0
 * =============================================================================
 *
 * This SDK provides applets with access to Concierge platform capabilities.
 * It is automatically injected into every applet at runtime and exposed
 * as the global `ConciergeSDK` object on `window`.
 *
 * Applets can also explicitly include it via:
 *   <script src="/applet-sdk.js"></script>
 *
 * -----------------------------------------------------------------------------
 * Quick Start
 * -----------------------------------------------------------------------------
 *
 *   // Verify the SDK is loaded
 *   console.log(ConciergeSDK.version); // "1.8.0"
 *
 *   // Call the AI agent
 *   var response = await ConciergeSDK.agent.chat({
 *       messages: [{ role: "user", content: "Translate 'hello' to Arabic" }],
 *       systemPrompt: "You are a translation assistant.",
 *   });
 *   console.log(response.result);
 *
 *   // Make a direct model call without agent tools/connectors
 *   var translation = await ConciergeSDK.models.generate({
 *       prompt: "Translate 'hello' to Arabic. Return only the translation.",
 *       reasoningEffort: "low",
 *   });
 *   console.log(translation.result);
 *
 * -----------------------------------------------------------------------------
 * Available Functions
 * -----------------------------------------------------------------------------
 *
 *   ConciergeSDK.locale.get()
 *     - Read the current applet UI language and text direction.
 *     - returns {{ language: string, direction: "ltr"|"rtl" }}
 *
 *   ConciergeSDK.locale.getLanguage()
 *     - returns {string}  "en" or "ar"
 *
 *   ConciergeSDK.locale.getDirection()
 *     - returns {string}  "ltr" or "rtl"
 *
 *   ConciergeSDK.locale.isRtl()
 *     - returns {boolean}
 *
 *   ConciergeSDK.agent.chat(options)
 *     - Send messages to the AI agent and get a response.
 *     - param  {Object}   options
 *     - param  {Array}    options.messages       Array of {role, content} objects (required)
 *     - param  {string}   [options.systemPrompt] Optional system prompt
 *     - param  {string}   [options.model]        Optional model override
 *     - returns {Promise<{result: string, warnings: Array, errors: Array}>}
 *     - NOTE: `result` is Markdown-formatted. Render it with a Markdown
 *       library (e.g. marked, markdown-it) rather than inserting as plain text.
 *
 *   ConciergeSDK.models.list()
 *     - List applet-available chat models and supported reasoning efforts.
 *     - returns {Promise<{models: Array, defaultModel: string, reasoningEfforts: Array}>}
 *
 *   ConciergeSDK.models.generate(options)
 *     - Make a stateless direct model call without agent tools/connectors.
 *     - param  {Object}   options
 *     - param  {string}   [options.prompt]          Prompt text
 *     - param  {Array}    [options.messages]        Array of {role, content} objects
 *     - param  {string}   [options.systemPrompt]    Optional system prompt
 *     - param  {string}   [options.model]           Optional model ID from models.list()
 *     - param  {string}   [options.reasoningEffort] Optional: "none", "low", "medium", or "high"
 *     - returns {Promise<{result: string}>}
 *
 *   ConciergeSDK.services.getAccessToken(options)
 *     - Get an OAuth access token for a connected external service.
 *     - param  {Object}   options
 *     - param  {string}   options.service  Service identifier: "atlassian", "github", or "slack"
 *     - returns {Promise<{token: string, service: string, expiresAt: number|null, metadata: Object}>}
 *     - if the service is not connected or the token is expired, the SDK
 *       opens a popup (synchronously on your click), then retries
 *     - Jira Cloud JQL search: use /rest/api/3/search/jql (not /rest/api/3/search,
 *       removed — see Atlassian Issue search REST docs & changelog #CHANGE-2046)
 *
 *   ConciergeSDK.params.get(name)
 *     - Read a URL query parameter passed to the applet page.
 *     - param  {string} name  Parameter name (e.g. "team")
 *     - returns {string|undefined}
 *
 *   ConciergeSDK.params.getAll()
 *     - Read all URL query parameters as a plain object.
 *     - returns {Object<string, string>}
 *
 *   ConciergeSDK.data.get()
 *     - Retrieve all stored data for this applet and user.
 *     - returns {Promise<Object>}  Key-value data object (empty {} if none)
 *
 *   ConciergeSDK.data.set(key, value)
 *     - Store a key-value pair for this applet and user.
 *     - param  {string} key    The data key (non-empty string)
 *     - param  {*}      value  The value to store (any JSON-serializable value)
 *     - returns {Promise<Object>}  The full updated data object
 *
 *   ConciergeSDK.sharedData.get(key)
 *     - Retrieve revision-protected data shared by all users of this applet.
 *     - returns {Promise<{found: boolean, value: Object, revision: string|null}>}
 *
 *   ConciergeSDK.sharedData.set(key, value)
 *     - Create or replace shared applet data with backups/revision protection.
 *     - returns {Promise<{success: boolean, value: *, revision: string}>}
 *
 *   ConciergeSDK.files.list()
 *     - List all files stored for this applet and user.
 *     - returns {Promise<Array>}  Array of file objects
 *
 *   ConciergeSDK.files.upload(file)
 *     - Upload a file for this applet and user.
 *     - param  {File} file  A File object (from input[type=file] or new File())
 *     - returns {Promise<{file: Object, files: Array}>}
 *
 *   ConciergeSDK.files.getContentUrl(fileId)
 *     - Get the URL to fetch a file's content.
 *     - param  {string} fileId  The file's _id
 *     - returns {string}  URL path (synchronous)
 *
 *   ConciergeSDK.files.delete(filename)
 *     - Delete a file by filename.
 *     - param  {string} filename  The stored filename
 *     - returns {Promise<{files: Array}>}  Updated list of remaining files
 *
 * =============================================================================
 */
(function () {
    // Guard against double-loading
    if (window.ConciergeSDK) {
        return;
    }

    function _oauthPopupFeatures() {
        var width = 600;
        var height = 700;
        var left = window.screenX + (window.outerWidth - width) / 2;
        var top = window.screenY + (window.outerHeight - height) / 2;
        return (
            "width=" +
            width +
            ",height=" +
            height +
            ",left=" +
            left +
            ",top=" +
            top
        );
    }

    /**
     * Sandboxed srcDoc iframes may expose location.origin as the string "null".
     * Prefer top/parent/ancestorOrigins when readable (same-origin).
     */
    function _conciergeEffectiveOrigin() {
        var o = window.location.origin;
        if (o && o !== "null") {
            return o;
        }
        try {
            if (
                window.top &&
                window.top.location &&
                window.top.location.origin &&
                window.top.location.origin !== "null"
            ) {
                return window.top.location.origin;
            }
        } catch (e1) {}
        try {
            if (
                window.parent &&
                window.parent !== window &&
                window.parent.location &&
                window.parent.location.origin &&
                window.parent.location.origin !== "null"
            ) {
                return window.parent.location.origin;
            }
        } catch (e2) {}
        if (
            window.location.ancestorOrigins &&
            window.location.ancestorOrigins.length > 0
        ) {
            return window.location.ancestorOrigins[0];
        }
        return "";
    }

    /**
     * Read the applet ID from the <meta name="applet-id"> tag in the document.
     * Returns null if the tag is missing or has no content.
     */
    function _getAppletId() {
        var meta = document.querySelector('meta[name="applet-id"]');
        if (meta && meta.content) {
            return meta.content;
        }
        return null;
    }

    /**
     * Get the applet ID or throw a descriptive error.
     */
    function _requireAppletId() {
        var id = _getAppletId();
        if (!id) {
            throw new Error(
                "[ConciergeSDK] No applet-id meta tag found. " +
                    "Applet-scoped SDK APIs require a registered applet.",
            );
        }
        return id;
    }

    function _resolveAuthorizeUrl(connectInfo) {
        var service = connectInfo.service;
        if (connectInfo.mcpOAuthInit) {
            var origin = _conciergeEffectiveOrigin();
            var redirectUri = (origin || "") + connectInfo.mcpOAuthRedirect;
            return fetch(connectInfo.mcpOAuthInit, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ redirectUri: redirectUri }),
            }).then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok || !data.authorizeUrl) {
                        throw new Error(
                            data.error || "Failed to initialize OAuth",
                        );
                    }
                    return data.authorizeUrl;
                });
            });
        }
        if (connectInfo.oauthUrl) {
            var u = connectInfo.oauthUrl;
            return Promise.resolve(
                u.indexOf("http") === 0 ? u : _conciergeEffectiveOrigin() + u,
            );
        }
        return Promise.reject(
            new Error("No OAuth configuration for " + service),
        );
    }

    /**
     * Popup must be opened in the same synchronous turn as the user gesture.
     * Pass a window from window.open("about:blank", ...) at the start of
     * getAccessToken; after async work, navigate it to the authorize URL.
     */
    function _initiateOAuth(connectInfo) {
        var service = connectInfo.service;

        // When running inside a sandboxed iframe, delegate popup to the host
        // window via postMessage so we don't need allow-popups-to-escape-sandbox.
        if (window.parent && window.parent !== window) {
            return new Promise(function (resolve, reject) {
                var requestId =
                    "oauth_" +
                    Date.now() +
                    "_" +
                    Math.random().toString(36).substr(2, 9);

                var settled = false;
                function settle(error) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    window.removeEventListener("message", onMessage);
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                }

                var timeout = setTimeout(function () {
                    var err = new Error("OAuth timed out for " + service + ".");
                    err.code = "OAUTH_TIMEOUT";
                    settle(err);
                }, 240000);

                function onMessage(event) {
                    if (
                        !event ||
                        !event.data ||
                        event.data.type !== "__OAUTH_RESPONSE__"
                    ) {
                        return;
                    }
                    if (event.data.requestId !== requestId) {
                        return;
                    }
                    if (event.data.success) {
                        settle(null);
                    } else {
                        var err = new Error(
                            event.data.error || "OAuth failed for " + service,
                        );
                        err.code = event.data.code || "OAUTH_FAILED";
                        settle(err);
                    }
                }
                window.addEventListener("message", onMessage);

                window.parent.postMessage(
                    {
                        type: "__OAUTH_REQUEST__",
                        requestId: requestId,
                        connectInfo: connectInfo,
                    },
                    "*",
                );
            });
        }

        // Fallback: direct popup (non-iframe context)
        return _resolveAuthorizeUrl(connectInfo).then(function (authorizeUrl) {
            return new Promise(function (resolve, reject) {
                var popup = window.open(
                    authorizeUrl,
                    "concierge-oauth",
                    _oauthPopupFeatures(),
                );

                if (!popup) {
                    var err = new Error(
                        "Popup blocked. Please allow popups to connect " +
                            service +
                            ".",
                    );
                    err.code = "POPUP_BLOCKED";
                    reject(err);
                    return;
                }

                var settled = false;
                function settle(error) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    clearInterval(closedCheck);
                    window.removeEventListener("message", onMessage);
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                }

                var timeout = setTimeout(function () {
                    var err = new Error("OAuth timed out for " + service + ".");
                    err.code = "OAUTH_TIMEOUT";
                    settle(err);
                }, 240000);

                var expectedType = service + "-oauth-complete";
                function onMessage(event) {
                    if (
                        !event ||
                        !event.data ||
                        event.data.type !== expectedType
                    ) {
                        return;
                    }
                    if (event.source && event.source !== popup) {
                        return;
                    }
                    if (event.data.success) {
                        settle(null);
                    } else {
                        var err = new Error(
                            event.data.error || "OAuth failed for " + service,
                        );
                        err.code = "OAUTH_FAILED";
                        settle(err);
                    }
                }
                window.addEventListener("message", onMessage);

                var closedCheck = setInterval(function () {
                    if (popup && popup.closed) {
                        var err = new Error(
                            "OAuth window was closed before completing.",
                        );
                        err.code = "OAUTH_CANCELLED";
                        settle(err);
                    }
                }, 1000);
            });
        });
    }

    function _sleep(ms) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, ms);
        });
    }

    function _retryAfterMs(res) {
        var value =
            res.headers && typeof res.headers.get === "function"
                ? res.headers.get("Retry-After")
                : null;
        var seconds = value ? Number(value) : NaN;
        if (Number.isFinite(seconds) && seconds >= 0) {
            return seconds * 1000;
        }
        var dateMs = value ? Date.parse(value) : NaN;
        return Number.isFinite(dateMs) && dateMs > Date.now()
            ? dateMs - Date.now()
            : null;
    }

    function _apiError(res, fallback) {
        return res
            .json()
            .catch(function () {
                return {};
            })
            .then(function (err) {
                var error = new Error(err.error || fallback);
                error.status = res.status;
                error.code = err.code || "UNKNOWN";
                error.retryAfter = _retryAfterMs(res);
                error.details = err;
                error.connectInfo = err.connectInfo;
                throw error;
            });
    }

    function _apiFetch(url, options, fallback, retryOptions) {
        retryOptions = retryOptions || {};
        var retries = retryOptions.retries || 0;
        var baseDelayMs = retryOptions.baseDelayMs || 500;

        function shouldRetry(res, attempt) {
            return (
                attempt < retries && (res.status === 429 || res.status === 503)
            );
        }

        function attemptFetch(attempt) {
            return fetch(url, options).then(function (res) {
                if (res.ok) return res.json();
                if (shouldRetry(res, attempt)) {
                    var retryAfter = _retryAfterMs(res);
                    var delay =
                        retryAfter != null
                            ? retryAfter
                            : baseDelayMs * Math.pow(2, attempt);
                    return _sleep(delay).then(function () {
                        return attemptFetch(attempt + 1);
                    });
                }
                return _apiError(res, fallback);
            });
        }

        return attemptFetch(0);
    }

    var _sharedDataRevisions = {};

    function _sharedDataArgs(keyOrOptions, value) {
        if (typeof keyOrOptions === "string") {
            return { key: keyOrOptions, value: value };
        }
        return keyOrOptions || {};
    }

    function _sharedDataCacheKey(appletId, key) {
        return appletId + ":" + key;
    }

    function _rememberSharedDataRevision(appletId, result) {
        if (result && result.key && result.revision != null) {
            _sharedDataRevisions[_sharedDataCacheKey(appletId, result.key)] =
                result.revision;
        }
        return result;
    }

    function _sharedDataRevisionFor(appletId, key) {
        return _sharedDataRevisions[_sharedDataCacheKey(appletId, key)];
    }

    function _normalizeSdkLanguage(value) {
        return value === "ar" ? "ar" : "en";
    }

    function _normalizeSdkDirection(value) {
        return value === "rtl" ? "rtl" : "ltr";
    }

    var ConciergeSDK = {
        /**
         * SDK version following semver.
         * @type {string}
         */
        version: "1.8.0",

        /**
         * Locale namespace — Arabic/English language and text direction.
         * Mirrors the host Concierge app's language setting.
         */
        locale: {
            /**
             * @returns {{ language: string, direction: "ltr"|"rtl" }}
             */
            get: function () {
                return {
                    language: _normalizeSdkLanguage(window.LABEEB_LANGUAGE),
                    direction: _normalizeSdkDirection(window.LABEEB_DIRECTION),
                };
            },

            /** @returns {string} */
            getLanguage: function () {
                return _normalizeSdkLanguage(window.LABEEB_LANGUAGE);
            },

            /** @returns {"ltr"|"rtl"} */
            getDirection: function () {
                return _normalizeSdkDirection(window.LABEEB_DIRECTION);
            },

            /** @returns {boolean} */
            isRtl: function () {
                return (
                    _normalizeSdkDirection(window.LABEEB_DIRECTION) === "rtl"
                );
            },
        },

        /**
         * URL query parameters passed to the applet page (e.g. iframe src or /apps/{slug}?team=...).
         * Concierge-internal keys like openChat are excluded.
         */
        params: {
            /**
             * All query params as a plain object.
             * @returns {Object<string, string>}
             */
            getAll: function () {
                return Object.assign({}, window.APPLET_PARAMS || {});
            },

            /**
             * Read a single query param by name.
             * @param {string} name
             * @returns {string|undefined}
             */
            get: function (name) {
                var params = window.APPLET_PARAMS || {};
                return params[name];
            },
        },

        /**
         * Agent namespace — AI agent capabilities for applets.
         *
         * Calls are scoped to the currently logged-in user and run through
         * that user's personal agent when one is configured. Applet data and
         * files remain isolated per applet and per user.
         */
        agent: {
            /**
             * Send messages to the AI agent and get a response.
             * The request runs as the currently logged-in user's agent, so
             * user-available tools/connectors may be used normally.
             *
             * @param {Object} options
             * @param {Array<{role: string, content: string}>} options.messages
             *   Conversation messages. At least one message is required.
             * @param {string} [options.systemPrompt] - Optional system prompt
             *   to set the agent's behavior (e.g. "You are a translator").
             * @param {string} [options.model] - Optional model override.
             *   Defaults to the platform's default model.
             * @returns {Promise<{result: string, warnings: Array, errors: Array}>}
             *   The `result` field contains **Markdown-formatted** text.
             *   Render it with a Markdown library (e.g. marked, markdown-it)
             *   rather than inserting it as plain text.
             *
             * @example
             * var response = await ConciergeSDK.agent.chat({
             *     messages: [{ role: "user", content: "Hello!" }],
             * });
             * console.log(response.result);
             *
             * @example
             * var response = await ConciergeSDK.agent.chat({
             *     messages: [{ role: "user", content: "Translate 'good morning'" }],
             *     systemPrompt: "Translate all text to Arabic.",
             * });
             */
            chat: function (options) {
                options = options || {};
                var messages = options.messages;
                var appletId;

                if (
                    !messages ||
                    !Array.isArray(messages) ||
                    messages.length === 0
                ) {
                    return Promise.reject(
                        new Error("[ConciergeSDK] messages array is required"),
                    );
                }

                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                var body = { messages: messages, appletId: appletId };
                if (options.systemPrompt)
                    body.systemPrompt = options.systemPrompt;
                if (options.model) body.model = options.model;

                return _apiFetch(
                    "/api/applet/agent-chat",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(body),
                    },
                    "Agent chat request failed",
                    { retries: 2 },
                );
            },
        },

        /**
         * Models namespace — direct stateless model calls for applets.
         *
         * Use these helpers when an applet needs a plain model invocation
         * without the user's personal agent, tools, connectors, or memory.
         */
        models: {
            /**
             * List applet-available chat models.
             *
             * @returns {Promise<{models: Array, defaultModel: string, reasoningEfforts: Array}>}
             *
             * @example
             * var metadata = await ConciergeSDK.models.list();
             * console.log(metadata.defaultModel);
             */
            list: function () {
                var appletId;

                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                return _apiFetch(
                    "/api/applet/models?appletId=" +
                        encodeURIComponent(appletId),
                    {
                        method: "GET",
                        credentials: "include",
                    },
                    "Model list request failed",
                    { retries: 1 },
                );
            },

            /**
             * Make a stateless direct model call.
             *
             * @param {Object} options
             * @param {string} [options.prompt] - Prompt text.
             * @param {Array<{role: string, content: string}>} [options.messages]
             *   Conversation messages. Use either prompt or messages.
             * @param {string} [options.systemPrompt] - Optional system prompt.
             * @param {string} [options.model] - Optional model ID from list().
             * @param {("none"|"low"|"medium"|"high")} [options.reasoningEffort]
             *   Optional reasoning effort.
             * @returns {Promise<{result: string}>}
             *
             * @example
             * var response = await ConciergeSDK.models.generate({
             *     prompt: "Translate 'good morning' to Arabic. Return only the translation.",
             *     reasoningEffort: "low",
             * });
             */
            generate: function (options) {
                options = options || {};
                var appletId;
                var body;

                if (
                    !options.prompt &&
                    (!Array.isArray(options.messages) ||
                        options.messages.length === 0)
                ) {
                    return Promise.reject(
                        new Error(
                            "[ConciergeSDK] prompt or messages array is required",
                        ),
                    );
                }

                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                body = { appletId: appletId };
                if (options.prompt) body.prompt = options.prompt;
                if (options.messages) body.messages = options.messages;
                if (options.systemPrompt)
                    body.systemPrompt = options.systemPrompt;
                if (options.model) body.model = options.model;
                if (options.reasoningEffort)
                    body.reasoningEffort = options.reasoningEffort;

                return _apiFetch(
                    "/api/applet/model-generate",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(body),
                    },
                    "Model generate request failed",
                    { retries: 2 },
                );
            },
        },

        /**
         * Services namespace — access tokens for connected external services.
         *
         * Applets can request OAuth access tokens for services the user has
         * already connected (e.g. Jira, GitHub, Slack) and use them to call
         * those services' APIs directly.
         */
        services: {
            /**
             * Get an OAuth access token for a connected external service.
             *
             * @param {Object} options
             * @param {("atlassian"|"github"|"slack")} options.service
             *   The service to get a token for.
             * @returns {Promise<{token: string, service: string, expiresAt: number|null, metadata: Object}>}
             *   - token: The Authorization header value (e.g. "Bearer ...")
             *   - service: The service identifier
             *   - expiresAt: Token expiration timestamp (ms) or null
             *   - metadata: Service-specific fields (e.g. { cloudId, baseUrl } for Atlassian)
             *
             * @example
             * var jira = await ConciergeSDK.services.getAccessToken({ service: "atlassian" });
             * var response = await fetch(jira.metadata.baseUrl + "/rest/api/3/myself", {
             *     headers: { Authorization: jira.token },
             * });
             * var me = await response.json();
             *
             * @example
             * var gh = await ConciergeSDK.services.getAccessToken({ service: "github" });
             * var repos = await fetch("https://api.github.com/user/repos", {
             *     headers: { Authorization: gh.token },
             * });
             */
            getAccessToken: function (options) {
                options = options || {};
                var service = options.service;

                if (!service || typeof service !== "string") {
                    return Promise.reject(
                        new Error("[ConciergeSDK] service is required"),
                    );
                }

                function fetchToken() {
                    var appletId = _requireAppletId();
                    return _apiFetch(
                        "/api/applet/service-token",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({
                                service: service,
                                appletId: appletId,
                            }),
                        },
                        "Failed to get access token",
                    );
                }

                return Promise.resolve()
                    .then(fetchToken)
                    .catch(function (err) {
                        var recoverable =
                            err.code === "SERVICE_NOT_CONNECTED" ||
                            err.code === "TOKEN_EXPIRED";
                        if (recoverable && err.connectInfo) {
                            console.log(
                                "[ConciergeSDK] " +
                                    service +
                                    " requires OAuth — connecting…",
                            );
                            return _initiateOAuth(err.connectInfo)
                                .then(fetchToken)
                                .catch(function (oauthErr) {
                                    throw oauthErr;
                                });
                        }
                        throw err;
                    });
            },
        },

        /**
         * Data namespace — per-user key-value storage for applets.
         *
         * Each user gets their own isolated data store within an applet.
         * Requires a <meta name="applet-id"> tag in the HTML.
         */
        data: {
            /**
             * Retrieve all stored data for this applet and user.
             *
             * @returns {Promise<Object>} Key-value data object ({} if empty)
             *
             * @example
             * var stored = await ConciergeSDK.data.get();
             * console.log(stored.counter); // 42
             */
            get: function () {
                try {
                    var appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                return _apiFetch(
                    "/api/canvas-applets/" + appletId + "/data",
                    {
                        method: "GET",
                        credentials: "include",
                    },
                    "Failed to get applet data",
                    { retries: 1 },
                ).then(function (body) {
                    return body.data;
                });
            },

            /**
             * Store a key-value pair for this applet and user.
             *
             * @param {string} key   The data key
             * @param {*}      value The value to store
             * @returns {Promise<Object>} The full updated data object
             *
             * @example
             * var updated = await ConciergeSDK.data.set("counter", 42);
             * console.log(updated.counter); // 42
             */
            set: function (key, value) {
                if (!key || typeof key !== "string") {
                    return Promise.reject(
                        new Error(
                            "[ConciergeSDK] key must be a non-empty string",
                        ),
                    );
                }
                if (value === undefined) {
                    return Promise.reject(
                        new Error("[ConciergeSDK] value is required"),
                    );
                }

                try {
                    var appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                return _apiFetch(
                    "/api/canvas-applets/" + appletId + "/data",
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ key: key, value: value }),
                    },
                    "Failed to set applet data",
                ).then(function (body) {
                    return body.data;
                });
            },
        },

        /**
         * Shared data namespace — revision-protected applet workspace storage.
         *
         * Unlike ConciergeSDK.data, values in this namespace are shared across
         * users of the same applet key.
         */
        sharedData: {
            /**
             * Retrieve one shared workspace value.
             *
             * @param {string|Object} keyOrOptions The key string, or { key }
             * @returns {Promise<{found: boolean, value: Object, revision: string|null}>}
             */
            get: function (keyOrOptions) {
                var options = _sharedDataArgs(keyOrOptions);
                if (!options.key || typeof options.key !== "string") {
                    return Promise.reject(
                        new Error(
                            "[ConciergeSDK] key must be a non-empty string",
                        ),
                    );
                }

                try {
                    var appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                var url =
                    "/api/canvas-applets/" +
                    appletId +
                    "/shared-data/" +
                    encodeURIComponent(options.key);
                return _apiFetch(
                    url,
                    {
                        method: "GET",
                        credentials: "include",
                    },
                    "Failed to get shared applet data",
                    { retries: 1 },
                ).then(function (body) {
                    return _rememberSharedDataRevision(appletId, body);
                });
            },

            /**
             * Create or replace one shared workspace value. Existing values
             * are backed up automatically. If this tab loaded the value first,
             * the SDK sends the last seen revision to prevent stale overwrites.
             *
             * @param {string|Object} keyOrOptions The key string, or { key, value }
             * @param {Object} [value] Value to store when key is a string
             */
            set: function (keyOrOptions, value) {
                var options = _sharedDataArgs(keyOrOptions, value);
                var expectedRevision;
                if (!options.key || typeof options.key !== "string") {
                    return Promise.reject(
                        new Error(
                            "[ConciergeSDK] key must be a non-empty string",
                        ),
                    );
                }
                if (options.value === undefined) {
                    return Promise.reject(
                        new Error("[ConciergeSDK] value is required"),
                    );
                }
                if (
                    !options.value ||
                    typeof options.value !== "object" ||
                    Array.isArray(options.value)
                ) {
                    return Promise.reject(
                        new Error("[ConciergeSDK] value must be an object"),
                    );
                }

                try {
                    var appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                expectedRevision =
                    options.expectedRevision !== undefined
                        ? options.expectedRevision
                        : _sharedDataRevisionFor(appletId, options.key);

                return _apiFetch(
                    "/api/canvas-applets/" +
                        appletId +
                        "/shared-data/" +
                        encodeURIComponent(options.key),
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                            value: options.value,
                            expectedRevision: expectedRevision,
                            reset: options.reset === true,
                        }),
                    },
                    "Failed to set shared applet data",
                ).then(function (body) {
                    return _rememberSharedDataRevision(appletId, body);
                });
            },

            /**
             * Clear or reset shared data through the explicit reset path.
             * Use this only for user-confirmed reset actions.
             */
            reset: function (keyOrOptions, value) {
                var options = _sharedDataArgs(keyOrOptions, value);
                options.reset = true;
                return this.set(options);
            },

            /**
             * List recovery snapshots for one shared workspace value.
             */
            backups: function (keyOrOptions) {
                var options = _sharedDataArgs(keyOrOptions);
                if (!options.key || typeof options.key !== "string") {
                    return Promise.reject(
                        new Error(
                            "[ConciergeSDK] key must be a non-empty string",
                        ),
                    );
                }

                try {
                    var appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                var url =
                    "/api/canvas-applets/" +
                    appletId +
                    "/shared-data/" +
                    encodeURIComponent(options.key) +
                    "/backups";
                return _apiFetch(
                    url,
                    {
                        method: "GET",
                        credentials: "include",
                    },
                    "Failed to list shared applet data backups",
                    { retries: 1 },
                ).then(function (body) {
                    return body.backups;
                });
            },

            /**
             * Restore one recovery snapshot.
             */
            restore: function (keyOrOptions, backupIdOrRevision) {
                var options = _sharedDataArgs(keyOrOptions);
                var appletId;
                if (!options.key || typeof options.key !== "string") {
                    return Promise.reject(
                        new Error(
                            "[ConciergeSDK] key must be a non-empty string",
                        ),
                    );
                }
                if (
                    typeof backupIdOrRevision === "number" &&
                    options.revision == null
                ) {
                    options.revision = backupIdOrRevision;
                } else if (
                    backupIdOrRevision != null &&
                    options.backupId == null
                ) {
                    options.backupId = backupIdOrRevision;
                }
                if (!options.backupId && options.revision == null) {
                    return Promise.reject(
                        new Error(
                            "[ConciergeSDK] backupId or revision is required",
                        ),
                    );
                }

                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                return _apiFetch(
                    "/api/canvas-applets/" +
                        appletId +
                        "/shared-data/" +
                        encodeURIComponent(options.key) +
                        "/restore",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                            backupId: options.backupId,
                            revision: options.revision,
                        }),
                    },
                    "Failed to restore shared applet data",
                ).then(function (body) {
                    return _rememberSharedDataRevision(appletId, body);
                });
            },
        },

        /**
         * Files namespace — per-user file storage for applets.
         *
         * Each user gets their own isolated file store within an applet.
         * Requires a <meta name="applet-id"> tag in the HTML.
         */
        files: {
            /**
             * List all files stored for this applet and user.
             *
             * @returns {Promise<Array>} Array of file objects
             *
             * @example
             * var files = await ConciergeSDK.files.list();
             * files.forEach(function(f) { console.log(f.originalName, f.size); });
             */
            list: function () {
                try {
                    var appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                return _apiFetch(
                    "/api/canvas-applets/" + appletId + "/files",
                    {
                        method: "GET",
                        credentials: "include",
                    },
                    "Failed to list applet files",
                    { retries: 1 },
                ).then(function (body) {
                    return body.files;
                });
            },

            /**
             * Upload a file for this applet and user.
             *
             * @param {File} file A File object
             * @returns {Promise<{file: Object, files: Array}>}
             *
             * @example
             * var input = document.querySelector('input[type="file"]');
             * var result = await ConciergeSDK.files.upload(input.files[0]);
             * console.log(result.file.url);
             */
            upload: function (file) {
                if (!file || !(file instanceof File)) {
                    return Promise.reject(
                        new Error("[ConciergeSDK] file must be a File object"),
                    );
                }

                try {
                    var appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                var formData = new FormData();
                formData.append("file", file);

                return _apiFetch(
                    "/api/canvas-applets/" + appletId + "/files",
                    {
                        method: "POST",
                        credentials: "include",
                        body: formData,
                    },
                    "Failed to upload file",
                );
            },

            /**
             * Get the URL to fetch a file's content.
             *
             * @param {string} fileId The file's _id
             * @returns {string} URL path
             *
             * @example
             * var url = ConciergeSDK.files.getContentUrl(file._id);
             * var img = document.createElement("img");
             * img.src = url;
             */
            getContentUrl: function (fileId) {
                if (!fileId || typeof fileId !== "string") {
                    throw new Error(
                        "[ConciergeSDK] fileId must be a non-empty string",
                    );
                }
                var appletId = _requireAppletId();
                return (
                    "/api/canvas-applets/" +
                    appletId +
                    "/files/" +
                    fileId +
                    "/content"
                );
            },

            /**
             * Delete a file by filename.
             *
             * @param {string} filename The stored filename
             * @returns {Promise<{files: Array}>} Updated list of remaining files
             *
             * @example
             * var result = await ConciergeSDK.files.delete("photo.png");
             * console.log(result.files.length);
             */
            delete: function (filename) {
                if (!filename || typeof filename !== "string") {
                    return Promise.reject(
                        new Error(
                            "[ConciergeSDK] filename must be a non-empty string",
                        ),
                    );
                }

                try {
                    var appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                return _apiFetch(
                    "/api/canvas-applets/" +
                        appletId +
                        "/files?filename=" +
                        encodeURIComponent(filename),
                    {
                        method: "DELETE",
                        credentials: "include",
                    },
                    "Failed to delete file",
                );
            },
        },
    };

    // ---- Runtime monitor (console + network capture) ----

    var _MON_MAX = 100;
    var _MON_BODY_MAX = 4096;

    var _monConsole = [];
    var _monNetwork = [];

    function _monTruncate(val, max) {
        if (typeof val !== "string") {
            try {
                val = JSON.stringify(val);
            } catch (e) {
                val = String(val);
            }
        }
        return val.length > max ? val.slice(0, max) + "... [truncated]" : val;
    }

    function _monPushConsole(entry) {
        if (_monConsole.length >= _MON_MAX) _monConsole.shift();
        _monConsole.push(entry);
    }

    function _monPushNetwork(entry) {
        if (_monNetwork.length >= _MON_MAX) _monNetwork.shift();
        _monNetwork.push(entry);
    }

    function _monArgsToString(args) {
        var parts = [];
        for (var i = 0; i < args.length; i++) {
            var a = args[i];
            if (a instanceof Error) {
                parts.push(a.message + (a.stack ? "\n" + a.stack : ""));
            } else if (typeof a === "object") {
                try {
                    parts.push(JSON.stringify(a));
                } catch (e) {
                    parts.push(String(a));
                }
            } else {
                parts.push(String(a));
            }
        }
        return parts.join(" ");
    }

    // Console capture
    var _origError = console.error;
    var _origWarn = console.warn;
    var _origLog = console.log;
    var _origInfo = console.info;

    console.error = function () {
        _monPushConsole({
            level: "error",
            message: _monTruncate(_monArgsToString(arguments), _MON_BODY_MAX),
            timestamp: new Date().toISOString(),
        });
        return _origError.apply(console, arguments);
    };

    console.warn = function () {
        _monPushConsole({
            level: "warn",
            message: _monTruncate(_monArgsToString(arguments), _MON_BODY_MAX),
            timestamp: new Date().toISOString(),
        });
        return _origWarn.apply(console, arguments);
    };

    console.log = function () {
        _monPushConsole({
            level: "log",
            message: _monTruncate(_monArgsToString(arguments), _MON_BODY_MAX),
            timestamp: new Date().toISOString(),
        });
        return _origLog.apply(console, arguments);
    };

    console.info = function () {
        _monPushConsole({
            level: "info",
            message: _monTruncate(_monArgsToString(arguments), _MON_BODY_MAX),
            timestamp: new Date().toISOString(),
        });
        return _origInfo.apply(console, arguments);
    };

    window.addEventListener("error", function (event) {
        _monPushConsole({
            level: "error",
            message: event.message || "Unknown error",
            source: event.filename
                ? event.filename + ":" + event.lineno + ":" + event.colno
                : undefined,
            stack:
                event.error && event.error.stack
                    ? _monTruncate(event.error.stack, _MON_BODY_MAX)
                    : undefined,
            timestamp: new Date().toISOString(),
        });
    });

    window.addEventListener("unhandledrejection", function (event) {
        var reason = event.reason;
        var message = "Unhandled promise rejection";
        var stack;
        if (reason instanceof Error) {
            message = reason.message;
            stack = reason.stack;
        } else if (typeof reason === "string") {
            message = reason;
        } else {
            try {
                message = JSON.stringify(reason);
            } catch (e) {
                message = String(reason);
            }
        }
        _monPushConsole({
            level: "error",
            message: _monTruncate(message, _MON_BODY_MAX),
            stack: stack ? _monTruncate(stack, _MON_BODY_MAX) : undefined,
            timestamp: new Date().toISOString(),
        });
    });

    // Network capture: fetch
    var _origFetch = window.fetch;
    if (_origFetch) {
        window.fetch = function () {
            var args = arguments;
            var url =
                typeof args[0] === "string"
                    ? args[0]
                    : (args[0] && args[0].url) || String(args[0]);
            var opts = args[1] || {};
            var method = (
                (args[0] && typeof args[0] !== "string" && args[0].method) ||
                opts.method ||
                "GET"
            ).toUpperCase();

            var entry = {
                method: method,
                url: _monTruncate(url, 500),
                startTime: new Date().toISOString(),
                status: null,
                statusText: null,
                duration: null,
                error: null,
                responseBody: null,
            };
            var t0 = Date.now();

            return _origFetch.apply(window, args).then(
                function (response) {
                    entry.status = response.status;
                    entry.statusText = response.statusText;
                    entry.duration = Date.now() - t0;
                    if (!response.ok || response.status >= 400) {
                        var cloned = response.clone();
                        cloned
                            .text()
                            .then(function (body) {
                                entry.responseBody = _monTruncate(
                                    body,
                                    _MON_BODY_MAX,
                                );
                            })
                            .catch(function () {});
                    }
                    _monPushNetwork(entry);
                    return response;
                },
                function (err) {
                    entry.duration = Date.now() - t0;
                    entry.error = err.message || String(err);
                    _monPushNetwork(entry);
                    throw err;
                },
            );
        };
    }

    // Network capture: XMLHttpRequest
    var _XHR = window.XMLHttpRequest;
    if (_XHR) {
        var _origOpen = _XHR.prototype.open;
        var _origSend = _XHR.prototype.send;

        _XHR.prototype.open = function (method, url) {
            this.__lbMon = {
                method: (method || "GET").toUpperCase(),
                url: _monTruncate(String(url), 500),
            };
            return _origOpen.apply(this, arguments);
        };

        _XHR.prototype.send = function () {
            var xhr = this;
            var mon = xhr.__lbMon;
            if (!mon) return _origSend.apply(this, arguments);

            var entry = {
                method: mon.method,
                url: mon.url,
                startTime: new Date().toISOString(),
                status: null,
                statusText: null,
                duration: null,
                error: null,
                responseBody: null,
            };
            var t0 = Date.now();

            xhr.addEventListener("load", function () {
                entry.status = xhr.status;
                entry.statusText = xhr.statusText;
                entry.duration = Date.now() - t0;
                if (xhr.status >= 400) {
                    try {
                        entry.responseBody = _monTruncate(
                            xhr.responseText,
                            _MON_BODY_MAX,
                        );
                    } catch (e) {}
                }
                _monPushNetwork(entry);
            });
            xhr.addEventListener("error", function () {
                entry.duration = Date.now() - t0;
                entry.error = "Network error";
                _monPushNetwork(entry);
            });
            xhr.addEventListener("timeout", function () {
                entry.duration = Date.now() - t0;
                entry.error = "Request timed out";
                _monPushNetwork(entry);
            });

            return _origSend.apply(this, arguments);
        };
    }

    // postMessage interface for parent window to retrieve captured data
    window.addEventListener("message", function (event) {
        if (!event.data || event.data.type !== "__APPLET_INSPECT_REQUEST__")
            return;

        // Only respond to requests from the parent window
        if (event.source !== window.parent) return;

        var response = {
            type: "__APPLET_INSPECT_RESPONSE__",
            requestId: event.data.requestId,
            data: {
                consoleEntries: _monConsole.slice(),
                networkRequests: _monNetwork.slice(),
            },
        };

        if (event.data.clear) {
            _monConsole = [];
            _monNetwork = [];
        }

        var origin;
        try {
            origin = event.origin || window.parent.location.origin;
        } catch (e) {
            origin = "*";
        }

        if (event.source) {
            event.source.postMessage(response, origin);
        } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(response, origin);
        }
    });

    // Expose on window
    window.ConciergeSDK = ConciergeSDK;
})();
