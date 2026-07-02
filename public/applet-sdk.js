/**
 * =============================================================================
 * Concierge Applet SDK v1.12.0
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
 *   console.log(ConciergeSDK.version); // "1.12.0"
 *
 *   // Call the AI agent
 *   var response = await ConciergeSDK.agent.chat({
 *       messages: [{ role: "user", content: "Translate 'hello' to Arabic" }],
 *       systemPrompt: "You are a translation assistant.",
 *   });
 *   console.log(response.result);
 *
 *   // Make a direct model call without agent tools/connectors
 *   var translation = await ConciergeSDK.models.executePrompt({
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
 *     - returns {Promise<{result: string, citations: Array, metadata: Object, warnings: Array, errors: Array}>}
 *     - NOTE: `result` is Markdown-formatted. In Concierge applets, prefer the
 *       native renderer bridge: write JSON to <pre class="llm-output"> with
 *       { markdown: result, citations: citations || [] }. The host renders it
 *       with Concierge's Markdown and citation UI. Use a third-party Markdown
 *       library only when the applet must also run outside Concierge.
 *
 *   ConciergeSDK.sourceQa.query(options)
 *     - Ask the source Q&A retrieval pathway.
 *     - param  {Object}   options
 *     - param  {string}   options.text       Question to answer
 *     - param  {string|Object} [options.contextInfo] Prior context for follow-up resolution
 *     - param  {string}   [options.language] Response language label; omit to let source Q&A infer it
 *     - param  {boolean}  [options.searchInternet] Include internet news fallback
 *     - param  {number}   [options.maxInternetResults] Internet fallback result count
 *     - param  {number}   [options.followUpQuestionCount] Suggested next-question count
 *     - param  {boolean}  [options.stream] Stream chunks before resolving the complete response
 *     - returns {Promise<{result: string, citations: Array, confidence: string|null, coverage: Object|null, metadata: Object, resultData: Object, tool: Object, followUpQuestions: Array, warnings: Array, errors: Array}>}
 *
 *   ConciergeSDK.sourceQa.stream(options)
 *     - Stream source Q&A answer chunks with onChunk/onUpdate callbacks.
 *     - returns the same final response shape as sourceQa.query().
 *
 *   ConciergeSDK.models.list()
 *     - List applet-available chat models and supported reasoning efforts.
 *     - returns {Promise<{models: Array, defaultModel: string, reasoningEfforts: Array}>}
 *
 *   ConciergeSDK.models.executePrompt(options)
 *   ConciergeSDK.models.generate(options) // backward-compatible alias
 *     - Make a stateless direct model call without agent tools/connectors.
 *     - param  {Object}   options
 *     - param  {string}   [options.prompt]          Prompt text
 *     - param  {Array}    [options.messages]        Array of {role, content} objects
 *     - param  {string}   [options.systemPrompt]    Optional system prompt
 *     - param  {string}   [options.model]           Optional model ID from models.list()
 *     - param  {string}   [options.reasoningEffort] Optional: "none", "low", "medium", or "high"
 *     - returns {Promise<{result: string, citations: Array, metadata: Object}>}
 *
 *   ConciergeSDK.media.models()                  - List available media models.
 *   ConciergeSDK.media.create(options)           - Start generic media generation.
 *   ConciergeSDK.media.createImage(options)      - Start image generation.
 *   ConciergeSDK.media.createVideo(options)      - Start video generation.
 *   ConciergeSDK.media.createMusic(options)      - Start music/audio generation.
 *   ConciergeSDK.media.createSpeech(options)     - Start speech/TTS generation.
 *   ConciergeSDK.media.transcribe(options)       - Start transcription.
 *   ConciergeSDK.media.translateSubtitles(options) - Start subtitle translation.
 *   ConciergeSDK.tasks.get(taskId)               - Fetch task status/result.
 *   ConciergeSDK.tasks.wait(taskId, options)     - Poll until task completion.
 *
 *   ConciergeSDK.workspace.prompts.list()
 *     - List legacy workspace prompts linked to this applet, if any.
 *     - returns {Promise<{workspaceId: string, prompts: Array}>}
 *
 *   ConciergeSDK.workspace.prompts.run(options)
 *     - Run a linked workspace prompt by promptId.
 *     - param  {Object} options
 *     - param  {string} options.promptId Prompt ID from list()
 *     - param  {string} [options.input] User input for the prompt
 *     - param  {Array}  [options.files] Files to include
 *     - returns {Promise<{output: string, citations: Array, metadata: Object}>}
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
 *   ConciergeSDK.navigation.open(path, options)
 *   ConciergeSDK.navigation.navigate(path, options) // alias
 *     - Navigate the host Concierge app to another internal route.
 *     - param  {string}  path              Internal path such as "/apps/foo"
 *     - param  {Object}  [options]
 *     - param  {boolean} [options.replace] Replace history entry instead of pushing
 *     - returns {Promise<{success: true, path: string, replace: boolean}>}
 *
 *   ConciergeSDK.data.get([key])
 *     - Retrieve one key or all stored data for this applet and user.
 *     - param  {string} [key]  Optional key to load without fetching all data
 *     - returns {Promise<*>}    Key value when key is provided, otherwise object
 *
 *   ConciergeSDK.data.set(key, value)
 *     - Store a key-value pair for this applet and user.
 *     - param  {string} key    The data key (non-empty string)
 *     - param  {*}      value  Small JSON-serializable value to store
 *     - note   Keep each key value under 2MB. Store large current-user
 *              datasets with ConciergeSDK.files applet-user files instead.
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
 *     - List applet-user files stored for this applet and user.
 *     - returns {Promise<Array>}  Array of file objects
 *
 *   ConciergeSDK.files.upload(file)
 *     - Upload a file to this user's applet-user file store.
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

    function _buildSourceQaRequestBody(options, appletId) {
        var text =
            typeof options.text === "string" ? options.text : options.question;

        if (!text || typeof text !== "string") {
            throw new Error("[ConciergeSDK] text is required");
        }

        var body = {
            appletId: appletId,
            text: text,
        };
        if (options.contextInfo !== undefined)
            body.contextInfo = options.contextInfo;
        if (options.language !== undefined) body.language = options.language;
        if (options.maxSearchResults !== undefined)
            body.maxSearchResults = options.maxSearchResults;
        if (options.maxRefinementRounds !== undefined)
            body.maxRefinementRounds = options.maxRefinementRounds;
        if (options.searchInternet !== undefined)
            body.searchInternet = options.searchInternet !== false;
        if (options.maxInternetResults !== undefined)
            body.maxInternetResults = options.maxInternetResults;
        if (options.followUpQuestionCount !== undefined)
            body.followUpQuestionCount = options.followUpQuestionCount;
        if (options.skipAnswerSynthesis !== undefined) {
            body.skipAnswerSynthesis = !!options.skipAnswerSynthesis;
        }
        if (options.stream === true) body.stream = true;

        return body;
    }

    function _parseSsePayload(frame) {
        var lines = frame.split(/\r?\n/);
        var dataLines = [];
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].indexOf("data:") === 0) {
                dataLines.push(lines[i].slice(5).trim());
            }
        }
        if (!dataLines.length) return null;
        return JSON.parse(dataLines.join("\n"));
    }

    function _readSourceQaSseResponse(res, options) {
        options = options || {};
        if (!res.body || typeof res.body.getReader !== "function") {
            return Promise.reject(
                new Error(
                    "[ConciergeSDK] source Q&A streaming is not supported",
                ),
            );
        }

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        var accumulated = "";
        var finalResponse = null;
        var latestMetadata = null;

        function handlePayload(payload) {
            if (!payload) return;

            var event = payload.event;
            var data = payload.data || {};
            if (typeof options.onUpdate === "function") {
                options.onUpdate(event, data);
            }

            if (event === "metadata") {
                latestMetadata = data;
                return;
            }

            if (event === "data") {
                var chunk = data.chunk || "";
                if (chunk) {
                    accumulated += chunk;
                    if (data.metadata) {
                        latestMetadata = data.metadata;
                    }
                    if (typeof options.onChunk === "function") {
                        options.onChunk(
                            chunk,
                            Object.assign({}, data, {
                                metadata: data.metadata || latestMetadata,
                            }),
                        );
                    }
                }
                return;
            }

            if (event === "complete") {
                finalResponse = data;
                latestMetadata = data;
                if (typeof options.onComplete === "function") {
                    options.onComplete(finalResponse);
                }
                return;
            }

            if (event === "error") {
                throw new Error(data.error || "source Q&A streaming failed");
            }
        }

        function processBuffer(flush) {
            var separatorIndex;
            while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
                var frame = buffer.slice(0, separatorIndex).trim();
                buffer = buffer.slice(separatorIndex + 2);
                if (frame) handlePayload(_parseSsePayload(frame));
            }
            if (flush && buffer.trim()) {
                handlePayload(_parseSsePayload(buffer.trim()));
                buffer = "";
            }
        }

        function readNext() {
            return reader.read().then(function (result) {
                if (result.done) {
                    processBuffer(true);
                    if (finalResponse) return finalResponse;
                    throw new Error(
                        "source Q&A stream ended before the final metadata was received",
                    );
                }

                buffer += decoder
                    .decode(result.value, { stream: true })
                    .replace(/\r\n/g, "\n");
                processBuffer(false);
                return readNext();
            });
        }

        return readNext().catch(function (error) {
            if (typeof options.onError === "function") {
                options.onError(error);
            }
            throw error;
        });
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

    function _normalizeNavigationPath(path) {
        if (typeof path !== "string") {
            throw new Error("[ConciergeSDK] navigation path must be a string");
        }

        var trimmedPath = path.trim();
        if (
            !trimmedPath ||
            trimmedPath.charAt(0) !== "/" ||
            trimmedPath.indexOf("//") === 0 ||
            trimmedPath.indexOf("\\") !== -1
        ) {
            throw new Error(
                "[ConciergeSDK] navigation path must be an internal path starting with '/'",
            );
        }

        return trimmedPath;
    }

    function _navigateHost(path, options) {
        var normalizedPath;
        var replace = !!(options && options.replace);

        try {
            normalizedPath = _normalizeNavigationPath(path);
        } catch (e) {
            return Promise.reject(e);
        }

        if (window.parent && window.parent !== window) {
            return new Promise(function (resolve, reject) {
                var requestId =
                    "nav_" +
                    Date.now() +
                    "_" +
                    Math.random().toString(36).substr(2, 9);

                var settled = false;
                function settle(error, response) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    window.removeEventListener("message", onMessage);
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                }

                var timeout = setTimeout(function () {
                    settle(
                        new Error(
                            "[ConciergeSDK] navigation request timed out for " +
                                normalizedPath,
                        ),
                    );
                }, 10000);

                function onMessage(event) {
                    if (
                        !event ||
                        !event.data ||
                        event.data.type !== "__LABEEB_NAVIGATION_RESPONSE__" ||
                        event.data.requestId !== requestId
                    ) {
                        return;
                    }

                    if (event.data.success) {
                        settle(null, {
                            success: true,
                            path: event.data.path || normalizedPath,
                            replace: !!event.data.replace,
                        });
                    } else {
                        settle(
                            new Error(
                                event.data.error ||
                                    "[ConciergeSDK] navigation request failed",
                            ),
                        );
                    }
                }

                window.addEventListener("message", onMessage);
                window.parent.postMessage(
                    {
                        type: "__LABEEB_NAVIGATION_REQUEST__",
                        requestId: requestId,
                        path: normalizedPath,
                        replace: replace,
                    },
                    "*",
                );
            });
        }

        if (replace) {
            window.location.replace(normalizedPath);
        } else {
            window.location.assign(normalizedPath);
        }

        return Promise.resolve({
            success: true,
            path: normalizedPath,
            replace: replace,
        });
    }

    var _MEDIA_SETTING_FIELDS = [
        "aspectRatio",
        "duration",
        "outputFormat",
        "outputQuality",
        "quality",
        "negativePrompt",
        "negative_prompt",
        "numberResults",
        "seed",
        "optimizePrompt",
        "generateAudio",
        "forceInstrumental",
        "resolution",
        "cameraFixed",
        "image_size",
        "imageSize",
        "width",
        "height",
        "size",
        "lyrics",
        "isInstrumental",
        "lyricsOptimizer",
        "audioUrl",
        "inputAudioUrl",
        "audioFormat",
        "sampleRate",
        "bitrate",
        "voiceName",
        "speaker1Name",
        "speaker1VoiceName",
        "speaker2Name",
        "speaker2VoiceName",
        "mode",
        "language",
        "speaker",
        "referenceText",
        "styleInstruction",
        "voiceDescription",
        "voice",
        "stability",
        "similarityBoost",
        "style",
        "speed",
        "previousText",
        "nextText",
        "languageCode",
        "voiceId",
        "customVoiceId",
        "volume",
        "pitch",
        "emotion",
        "channel",
        "languageBoost",
        "subtitleEnable",
        "englishNormalization",
    ];

    function _normalizeMediaReference(reference) {
        if (!reference) return null;
        if (typeof reference === "string") return { url: reference };
        if (reference.data && typeof reference.data === "object") {
            reference = reference.data;
        }

        var normalized = {};
        [
            "url",
            "azureUrl",
            "gcsUrl",
            "fileId",
            "blobPath",
            "hash",
            "role",
            "inputImageRole",
            "inputVideoRole",
            "inputImageBlobPath",
            "inputVideoBlobPath",
            "inputAudioBlobPath",
            "inputImageHash",
            "inputVideoHash",
            "inputAudioHash",
        ].forEach(function (field) {
            if (reference[field] !== undefined) {
                normalized[field] = reference[field];
            }
        });
        return normalized.url ||
            normalized.azureUrl ||
            normalized.gcsUrl ||
            normalized.fileId
            ? normalized
            : null;
    }

    function _normalizeMediaReferenceList(value) {
        if (value == null) return [];
        var list = Array.isArray(value) ? value : [value];
        return list
            .map(function (reference) {
                return _normalizeMediaReference(reference);
            })
            .filter(Boolean);
    }

    function _buildMediaCreateBody(options, defaults) {
        options = options || {};
        defaults = defaults || {};

        var body = {
            appletId: _requireAppletId(),
            operation: "create-media",
            outputType: options.outputType || defaults.outputType || "image",
        };
        if (defaults.mediaKind || options.mediaKind) {
            body.mediaKind = options.mediaKind || defaults.mediaKind;
        }
        if (options.prompt !== undefined) body.prompt = options.prompt;
        if (options.displayPrompt !== undefined) {
            body.displayPrompt = options.displayPrompt;
        }
        if (options.model || options.modelId) {
            body.model = options.model || options.modelId;
        }
        if (options.settings !== undefined) body.settings = options.settings;
        if (options.modelSettings !== undefined) {
            body.modelSettings = options.modelSettings;
        }
        if (options.outputFolder !== undefined) {
            body.outputFolder = options.outputFolder;
        }
        if (options.inputTags !== undefined) body.inputTags = options.inputTags;

        _MEDIA_SETTING_FIELDS.forEach(function (field) {
            if (options[field] !== undefined) body[field] = options[field];
        });

        var inputImages = _normalizeMediaReferenceList(
            options.inputImages || options.images || options.references,
        );
        if (options.inputImage) {
            inputImages.unshift(_normalizeMediaReference(options.inputImage));
        }
        inputImages = inputImages.filter(Boolean);
        if (inputImages.length) body.inputImages = inputImages;

        var inputVideos = _normalizeMediaReferenceList(
            options.inputVideos || options.videos,
        );
        if (options.inputVideo) {
            inputVideos.unshift(_normalizeMediaReference(options.inputVideo));
        }
        inputVideos = inputVideos.filter(Boolean);
        if (inputVideos.length) body.inputVideos = inputVideos;

        var inputAudio = _normalizeMediaReference(
            options.inputAudio || options.audio || options.voiceReference,
        );
        if (inputAudio) body.inputAudio = inputAudio;

        return body;
    }

    function _createMediaTask(options, defaults) {
        var body;
        try {
            body = _buildMediaCreateBody(options, defaults);
        } catch (e) {
            return Promise.reject(e);
        }

        return _apiFetch(
            "/api/applet/media",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            },
            "Media generation task request failed",
        );
    }

    var ConciergeSDK = {
        /**
         * SDK version following semver.
         * @type {string}
         */
        version: "1.12.0",

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
         * Navigation namespace — move the host Concierge app to another internal route.
         */
        navigation: {
            /**
             * Navigate the full Concierge page, not just the applet iframe.
             * @param {string} path Internal path, e.g. "/apps/my-app-slug".
             * @param {{replace?: boolean}} [options]
             * @returns {Promise<{success: true, path: string, replace: boolean}>}
             */
            open: function (path, options) {
                return _navigateHost(path, options);
            },

            /**
             * Alias for open().
             */
            navigate: function (path, options) {
                return _navigateHost(path, options);
            },
        },

        /**
         * Source Q&A namespace - source-grounded retrieval over configured
         * retrieval indexes. Returns the final answer and complete retrieval
         * diagnostics from Cortex.
         */
        sourceQa: {
            /**
             * Ask the source Q&A pathway.
             *
             * @param {Object} options
             * @param {string} options.text - Question to answer.
             * @param {string} [options.question] - Alias for text.
             * @param {string|Object} [options.contextInfo] - Prior context for follow-up resolution. Prefer { topic, previousQuestion, previousAnswer, turns, notes }.
             * @param {string} [options.language] - Response language label. Omit to let source Q&A infer it from the latest question.
             * @param {number} [options.maxSearchResults=12]
             * @param {number} [options.maxRefinementRounds]
             * @param {boolean} [options.searchInternet=true]
             * @param {number} [options.maxInternetResults=5]
             * @param {number} [options.followUpQuestionCount=0]
             * @param {boolean} [options.skipAnswerSynthesis=false]
             * @param {boolean} [options.stream=false] - When true, stream chunks and resolve with the final complete response. The default query path uses the same streaming transport internally but does not expose chunks unless callbacks are supplied.
             * @returns {Promise<{result: string, citations: Array, confidence: string|null, coverage: Object|null, metadata: Object, resultData: Object, tool: Object, followUpQuestions: Array, rawResultData: string|null, rawTool: string|null, warnings: Array, errors: Array}>}
             *
             * @example
             * var response = await ConciergeSDK.sourceQa.query({
             *     text: "What changed in the latest policy update?",
             * });
             * console.log(response.result, response.citations);
             */
            query: function (options) {
                options = options || {};
                return ConciergeSDK.sourceQa.stream(
                    Object.assign({}, options, { stream: true }),
                );
            },

            /**
             * Stream a source Q&A response and resolve with the final complete payload.
             *
             * @param {Object} options - Same options as query().
             * @param {Function} [options.onChunk] - Called as chunks arrive: (chunk, eventData) => void.
             * @param {Function} [options.onUpdate] - Called for every SSE event: (eventName, data) => void.
             * @param {Function} [options.onComplete] - Called with the final complete response.
             * @param {Function} [options.onError] - Called before the returned promise rejects.
             * @param {AbortSignal} [options.signal] - Optional cancellation signal.
             * @returns {Promise<{result: string, citations: Array, confidence: string|null, coverage: Object|null, metadata: Object, resultData: Object, tool: Object, followUpQuestions: Array, rawResultData: string|null, rawTool: string|null, warnings: Array, errors: Array}>}
             */
            stream: function (options) {
                options = options || {};
                var appletId;

                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                var body;
                try {
                    body = _buildSourceQaRequestBody(
                        Object.assign({}, options, { stream: true }),
                        appletId,
                    );
                } catch (e) {
                    return Promise.reject(e);
                }

                return fetch("/api/applet/source-qa", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    signal: options.signal,
                    body: JSON.stringify(body),
                }).then(function (res) {
                    if (!res.ok)
                        return _apiError(res, "source Q&A request failed");
                    return _readSourceQaSseResponse(res, options);
                });
            },

            /**
             * Get cached live starter questions for a source Q&A home screen.
             *
             * The server generates one set per language, caches it for the
             * current TTL, registers exact answer-cache keys in Cortex, and
             * starts bounded server-side answer prewarming. Applets should call
             * sourceQa.query()/stream() normally when a user selects one.
             *
             * @param {Object} [options]
             * @param {string} [options.language="en"] - "en" or "ar".
             * @param {boolean} [options.prewarmAnswers=true]
             * @returns {Promise<{language: string, sets: string[][], questions: Array, generatedAt: string, expiresAt: string, cache: Object, warnings: Array, errors: Array}>}
             */
            initialQuestions: function (options) {
                options = options || {};
                var appletId;

                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                return _apiFetch(
                    "/api/applet/source-qa/initial-questions",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                            appletId: appletId,
                            language: options.language || "en",
                            prewarmAnswers: options.prewarmAnswers !== false,
                        }),
                    },
                    "source Q&A initial questions request failed",
                    { retries: 1 },
                );
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
             * @returns {Promise<{result: string, citations: Array, metadata: Object, warnings: Array, errors: Array}>}
             *   The `result` field contains **Markdown-formatted** text.
             *   In Concierge applets, prefer writing JSON to
             *   <pre class="llm-output"> so the host renders Markdown and
             *   citation UI natively.
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
             * @returns {Promise<{result: string, citations: Array, metadata: Object}>}
             *
             * @example
             * var response = await ConciergeSDK.models.executePrompt({
             *     prompt: "Translate 'good morning' to Arabic. Return only the translation.",
             *     reasoningEffort: "low",
             * });
             */
            executePrompt: function (options) {
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

            /**
             * Backward-compatible alias for models.executePrompt().
             *
             * @param {Object} options
             * @returns {Promise<{result: string, citations: Array, metadata: Object}>}
             */
            generate: function (options) {
                return ConciergeSDK.models.executePrompt(options);
            },
        },

        /** Media namespace — background media generation/transcription tasks. */
        media: {
            /**
             * List media generation models and their media page defaults.
             *
             * @returns {Promise<{models: Array, defaultModel: string|null}>}
             */
            models: function () {
                var appletId;
                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }
                return _apiFetch(
                    "/api/applet/models?appletId=" +
                        encodeURIComponent(appletId) +
                        "&kind=media",
                    {
                        method: "GET",
                        credentials: "include",
                    },
                    "Media model list request failed",
                    { retries: 1 },
                );
            },

            /** Backward-friendly alias for media.models(). */
            listModels: function () {
                return ConciergeSDK.media.models();
            },

            /**
             * Start a generic media generation task. Accepts the same model
             * settings object used by the Media page plus top-level setting
             * shortcuts such as aspectRatio, duration, quality, lyrics,
             * voiceName, voiceDescription, seed, resolution, image_size,
             * and outputFormat.
             *
             * @param {Object} options
             * @param {string} [options.prompt]
             * @param {string} [options.model] model ID from media.models()
             * @param {"image"|"video"|"audio"} [options.outputType]
             * @param {Object} [options.settings]
             * @param {Object} [options.modelSettings]
             * @param {Array} [options.inputImages] URL/fileId/media refs
             * @param {Array} [options.inputVideos] URL/fileId/media refs
             * @param {Object|string} [options.inputAudio] URL/fileId/media ref
             * @param {string} [options.outputFolder]
             * @returns {Promise<{taskId: string, jobId?: string}>}
             */
            create: function (options) {
                return _createMediaTask(options, {});
            },

            /** Backward-friendly alias for media.create(). */
            generate: function (options) {
                return ConciergeSDK.media.create(options);
            },

            createImage: function (options) {
                return _createMediaTask(options, {
                    outputType: "image",
                    mediaKind: "image",
                });
            },

            createVideo: function (options) {
                return _createMediaTask(options, {
                    outputType: "video",
                    mediaKind: "video",
                });
            },

            createMusic: function (options) {
                return _createMediaTask(options, {
                    outputType: "audio",
                    mediaKind: "audio",
                });
            },

            createSpeech: function (options) {
                return _createMediaTask(options, {
                    outputType: "audio",
                    mediaKind: "tts",
                });
            },

            /**
             * Start a derivative generation from one or more references.
             * This is the same generation pipeline as create(); it only names
             * the intent for applet code that edits previous media results.
             */
            modify: function (options) {
                return ConciergeSDK.media.create(options);
            },

            /** Start a combined generation from multiple references. */
            combine: function (options) {
                return ConciergeSDK.media.create(options);
            },

            /** Wait for a media/transcription task to finish. */
            waitForResult: function (taskId, options) {
                return ConciergeSDK.tasks.wait(taskId, options);
            },

            /**
             * Start transcription for a URL, browser File, or uploaded file ID.
             *
             * @param {Object} options
             * @param {string} [options.url]
             * @param {File} [options.file]
             * @param {string} [options.fileId]
             * @param {string} [options.language]
             * @param {string} [options.responseFormat] "vtt", "formatted", or "text"
             * @param {string} [options.modelOption] Optional override; omit for server defaults (xAI + Gemini when enabled; Gemini for YouTube).
             * Word timing may return per-word VTT cues or inline time tags; render them visibly when requested.
             * @returns {Promise<{taskId: string, jobId?: string}>}
             */
            transcribe: function (options) {
                options = options || {};
                if (
                    typeof File !== "undefined" &&
                    options.file instanceof File
                ) {
                    var uploadOptions = Object.assign({}, options);
                    delete uploadOptions.file;
                    return ConciergeSDK.files
                        .upload(options.file)
                        .then(function (result) {
                            var fileId =
                                result &&
                                result.file &&
                                (result.file._id || result.file.id);
                            if (!fileId) {
                                throw new Error(
                                    "[ConciergeSDK] uploaded file did not return a file ID",
                                );
                            }
                            uploadOptions.fileId = fileId;
                            return ConciergeSDK.media.transcribe(uploadOptions);
                        });
                }

                var appletId;
                var body;
                var fileId =
                    options.fileId ||
                    (options.file &&
                        typeof options.file === "object" &&
                        (options.file._id || options.file.id));
                var optionalFields = [
                    "language",
                    "wordTimestamped",
                    "responseFormat",
                    "maxLineCount",
                    "maxLineWidth",
                    "maxWordsPerLine",
                    "highlightWords",
                    "modelOption",
                    "trackName",
                    "isAlternative",
                ];

                if (
                    (!options.url || typeof options.url !== "string") &&
                    (!fileId || typeof fileId !== "string")
                ) {
                    return Promise.reject(
                        new Error("[ConciergeSDK] url or fileId is required"),
                    );
                }

                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                body = {
                    appletId: appletId,
                    operation: "transcribe",
                };
                if (options.url) body.url = options.url;
                if (fileId) body.fileId = fileId;
                optionalFields.forEach(function (field) {
                    if (options[field] !== undefined) {
                        body[field] = options[field];
                    }
                });

                return _apiFetch(
                    "/api/applet/media",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(body),
                    },
                    "Transcription task request failed",
                );
            },

            /**
             * Start a subtitle translation task for SRT or VTT text.
             *
             * @param {Object} options
             * @param {string} options.text
             * @param {string} options.to Target language label, e.g. "Arabic"
             * @param {string} [options.format] "srt" or "vtt"
             * @returns {Promise<{taskId: string, jobId?: string}>}
             */
            translateSubtitles: function (options) {
                options = options || {};
                var appletId;
                var body;
                var text = options.text;

                if (!text || typeof text !== "string") {
                    return Promise.reject(
                        new Error("[ConciergeSDK] text is required"),
                    );
                }
                if (!options.to || typeof options.to !== "string") {
                    return Promise.reject(
                        new Error("[ConciergeSDK] to is required"),
                    );
                }

                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }

                body = {
                    appletId: appletId,
                    operation: "translate-subtitles",
                    text: text,
                    to: options.to,
                };
                if (options.format !== undefined) body.format = options.format;
                if (options.name !== undefined) body.name = options.name;

                return _apiFetch(
                    "/api/applet/media",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(body),
                    },
                    "Subtitle translation task request failed",
                );
            },
        },

        /**
         * Tasks namespace — status/result helpers for background tasks
         * started through applet SDK APIs.
         */
        tasks: {
            /**
             * Fetch a task status/result.
             *
             * @param {string} taskId
             * @returns {Promise<Object>}
             */
            get: function (taskId) {
                var appletId;

                if (!taskId || typeof taskId !== "string") {
                    return Promise.reject(
                        new Error(
                            "[ConciergeSDK] taskId must be a non-empty string",
                        ),
                    );
                }
                try {
                    appletId = _requireAppletId();
                } catch (e) {
                    return Promise.reject(e);
                }
                return _apiFetch(
                    "/api/applet/tasks/" +
                        encodeURIComponent(taskId) +
                        "?appletId=" +
                        encodeURIComponent(appletId),
                    {
                        method: "GET",
                        credentials: "include",
                    },
                    "Task status request failed",
                    { retries: 1 },
                );
            },

            /**
             * Poll a task until it reaches a terminal status.
             *
             * @param {string} taskId
             * @param {Object} [options]
             * @param {number} [options.intervalMs=2000]
             * @param {number} [options.timeoutMs=600000]
             * @param {Function} [options.onProgress]
             * @returns {Promise<Object>}
             */
            wait: function (taskId, options) {
                options = options || {};
                var intervalMs = Math.max(
                    250,
                    Number(options.intervalMs) || 2000,
                );
                var timeoutMs = Math.max(
                    intervalMs,
                    Number(options.timeoutMs) || 600000,
                );
                var startedAt = Date.now();
                var terminal = {
                    completed: true,
                    failed: true,
                    cancelled: true,
                    abandoned: true,
                };

                function poll() {
                    return ConciergeSDK.tasks.get(taskId).then(function (task) {
                        if (typeof options.onProgress === "function") {
                            options.onProgress(task);
                        }
                        if (terminal[task.status]) {
                            if (task.status === "completed") return task;
                            var message =
                                task.error ||
                                task.statusText ||
                                "Task ended with status " + task.status;
                            var error = new Error(message);
                            error.task = task;
                            error.status = task.status;
                            throw error;
                        }
                        if (Date.now() - startedAt >= timeoutMs) {
                            var timeoutError = new Error(
                                "[ConciergeSDK] task wait timed out",
                            );
                            timeoutError.task = task;
                            throw timeoutError;
                        }
                        return _sleep(intervalMs).then(poll);
                    });
                }

                return poll();
            },
        },

        /**
         * Workspace namespace — compatibility helpers for applets migrated
         * from legacy workspace applets.
         */
        workspace: {
            prompts: {
                /**
                 * List workspace prompts linked to this migrated applet.
                 *
                 * @returns {Promise<{workspaceId: string, prompts: Array}>}
                 */
                list: function () {
                    var appletId;

                    try {
                        appletId = _requireAppletId();
                    } catch (e) {
                        return Promise.reject(e);
                    }

                    return _apiFetch(
                        "/api/canvas-applets/" +
                            appletId +
                            "/workspace-prompts",
                        {
                            method: "GET",
                            credentials: "include",
                        },
                        "Workspace prompt list request failed",
                        { retries: 1 },
                    );
                },

                /**
                 * Run one linked workspace prompt by promptId.
                 *
                 * @param {Object} options
                 * @param {string} options.promptId
                 * @param {string} [options.input]
                 * @param {Array} [options.files]
                 * @param {Array} [options.chatHistory]
                 * @returns {Promise<{output: string, citations: Array, metadata: Object}>}
                 *   Render rich output by writing JSON to
                 *   <pre class="llm-output">:
                 *   { markdown: result.output, citations: result.citations || [] }
                 */
                run: function (options) {
                    options = options || {};
                    var appletId;

                    if (
                        !options.promptId ||
                        typeof options.promptId !== "string"
                    ) {
                        return Promise.reject(
                            new Error(
                                "[ConciergeSDK] promptId must be a non-empty string",
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
                            "/workspace-prompts/" +
                            encodeURIComponent(options.promptId) +
                            "/run",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({
                                prompt: options.input || options.prompt || "",
                                files: options.files || [],
                                chatHistory: options.chatHistory || null,
                                systemPrompt: options.systemPrompt || null,
                            }),
                        },
                        "Workspace prompt run request failed",
                        { retries: 2 },
                    );
                },
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
             * Retrieve one key or all stored data for this applet and user.
             *
             * @param {string} [key] Optional data key. Returns undefined if missing.
             * @returns {Promise<*>} Key value when key is provided, otherwise object.
             *
             * @example
             * var stored = await ConciergeSDK.data.get();
             * console.log(stored.counter); // 42
             * var settings = await ConciergeSDK.data.get("settings");
             */
            get: function (key) {
                if (key !== undefined && (!key || typeof key !== "string")) {
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

                var url = "/api/canvas-applets/" + appletId + "/data";
                if (key !== undefined) {
                    url += "?key=" + encodeURIComponent(key);
                }

                return _apiFetch(
                    url,
                    {
                        method: "GET",
                        credentials: "include",
                    },
                    "Failed to get applet data",
                    { retries: 1 },
                ).then(function (body) {
                    if (key !== undefined) {
                        return body.found ? body.value : undefined;
                    }
                    return body.data;
                });
            },

            /**
             * Store a key-value pair for this applet and user.
             *
             * @param {string} key   The data key
             * @param {*}      value Small JSON-serializable value to store.
             *                      Values over 2MB are rejected.
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
         * Each user gets their own isolated applet-user file store within an
         * applet. Use this for durable current-user files and large private
         * datasets such as uploaded transcripts, extracted segments, search
         * indexes, and user-specific exports.
         * Requires a <meta name="applet-id"> tag in the HTML.
         */
        files: {
            /**
             * List applet-user files stored for this applet and user.
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
