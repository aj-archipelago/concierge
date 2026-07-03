import {
    CHAT_CONTEXTUAL_TOOLS,
    handleDeleteApplet,
    handleDeleteAppletVersion,
    handleGetApplet,
    handleGetAppletState,
    handleGetAppletVersionSource,
    handleGenerateAppletImage,
    handleGenerateAppletMetadata,
    handleListApplets,
    handleOpenAppletDraft,
    handlePublishAppletVersion,
    handleCopyAppletVersionToDraft,
    handleSaveAppletDraftAsVersion,
    handleSetHomeApplet,
    handleUnpublishApplet,
    handleUpdateAppletMetadata,
} from "../chatTools";

describe("chat applet tools", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
        window.confirm = jest.fn();
    });

    test("advertises UpdateAppletMetadata for residual applet metadata operations", () => {
        const toolNames = CHAT_CONTEXTUAL_TOOLS.map(
            (tool) => tool.function.name,
        );
        const updateApplet = CHAT_CONTEXTUAL_TOOLS.find(
            (tool) => tool.function.name === "UpdateAppletMetadata",
        );
        const generateMetadata = CHAT_CONTEXTUAL_TOOLS.find(
            (tool) => tool.function.name === "GenerateAppletMetadata",
        );
        const generateImage = CHAT_CONTEXTUAL_TOOLS.find(
            (tool) => tool.function.name === "GenerateAppletImage",
        );
        const unpublishApplet = CHAT_CONTEXTUAL_TOOLS.find(
            (tool) => tool.function.name === "UnpublishApplet",
        );

        expect(toolNames).toEqual(
            expect.arrayContaining([
                "SetHomeApplet",
                "UpdateAppletMetadata",
                "GenerateAppletMetadata",
                "GenerateAppletImage",
            ]),
        );
        expect(updateApplet.function.description).toContain(
            "rename with `name`",
        );
        expect(updateApplet.function.description).toContain(
            "SaveAppletDraftAsVersion",
        );
        expect(updateApplet.function.parameters.properties).toHaveProperty(
            "publishToAppStore",
        );
        expect(updateApplet.function.parameters.properties).toHaveProperty(
            "appImageAlt",
        );
        expect(updateApplet.function.parameters.properties).toHaveProperty(
            "appImageLightUrl",
        );
        expect(updateApplet.function.parameters.properties).toHaveProperty(
            "appImageDarkUrl",
        );
        expect(updateApplet.function.parameters.properties).toHaveProperty(
            "appMetadataGeneratedAt",
        );
        expect(updateApplet.function.parameters.properties).toHaveProperty(
            "clearSdkSuspension",
        );
        expect(updateApplet.function.parameters.properties).not.toHaveProperty(
            "unpublish",
        );
        expect(generateMetadata.function.description).toContain(
            "applet-specific metadata endpoint",
        );
        expect(generateImage.function.description).toContain(
            "applet-specific image endpoint",
        );
        expect(generateImage.function.parameters.properties).toHaveProperty(
            "waitForResult",
        );
        expect(generateImage.function.parameters.properties).toHaveProperty(
            "styleCues",
        );
        expect(generateImage.function.parameters.properties).not.toHaveProperty(
            "model",
        );
        expect(unpublishApplet).toBeTruthy();
    });

    test("SetHomeApplet sets the active applet as the home page", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ homeAppletId: "applet123" }),
        });

        const result = await handleSetHomeApplet(
            { toolArgs: { userMessage: "Set this as home" } },
            {
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Dashboard",
                }),
            },
        );

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/users/me/home-applet",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ appletId: "applet123" }),
            }),
        );
        expect(result.success).toBe(true);
        expect(result.data.homeAppletId).toBe("applet123");
    });

    test("ListApplets in list mode returns Mongo applets with editable workspace paths", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "applet123",
                        name: "Weather Applet",
                        publishedVersionIndex: 1,
                        filePath: "https://blob/weather.html",
                        workspacePath: "/workspace/files/applets/weather.html",
                        fileHash: "hash123",
                        fileBlobPath: "applets/weather.html",
                    },
                    {
                        _id: "applet456",
                        name: "Timer",
                        publishedVersionIndex: null,
                        filePath: "https://blob/timer.html",
                        workspacePath: "/workspace/files/applets/timer.html",
                        fileHash: "hash456",
                        fileBlobPath: "applets/timer.html",
                    },
                ],
            }),
        });

        const result = await handleListApplets({
            toolArgs: { userMessage: "List applets" },
        });

        expect(result.success).toBe(true);
        expect(result.data.mode).toBe("list");
        expect(result.data.count).toBe(2);
        expect(result.data.applets[0].workspacePath).toBe(
            "/workspace/files/applets/weather.html",
        );
        expect(result.data.description).toContain("Editable file:");
        expect(global.fetch).toHaveBeenCalledWith("/api/canvas-applets");
    });

    test("ListApplets filters by applet name query", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "applet123",
                        name: "Weather Applet",
                        publishedVersionIndex: null,
                        workspacePath: "/workspace/files/applets/weather.html",
                    },
                    {
                        _id: "applet456",
                        name: "Timer",
                        publishedVersionIndex: null,
                        workspacePath: "/workspace/files/applets/timer.html",
                    },
                ],
            }),
        });

        const result = await handleListApplets({
            toolArgs: {
                query: "weather",
                userMessage: "List weather applets",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.mode).toBe("list");
        expect(result.data.count).toBe(1);
        expect(result.data.applets[0].name).toBe("Weather Applet");
    });

    test("ListApplets returns searchable applet card metadata", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "applet123",
                        name: "Untitled",
                        publishedVersionIndex: null,
                        workspacePath: "/workspace/files/applets/weather.html",
                        app: {
                            _id: "app123",
                            appletId: "applet123",
                            name: "Storm Desk",
                            slug: "storm-desk",
                            description: "Track storm coverage",
                            icon: "CloudSun",
                            imageUrl: "https://images.example/storm.webp",
                            imageAlt: "Storm dashboard",
                            badgeLabel: "Weather desk",
                            category: "weather",
                            tags: ["storm", "newsroom"],
                            metadataGeneratedAt: "2026-06-10T12:00:00.000Z",
                            listedInStore: false,
                            status: "active",
                        },
                    },
                ],
            }),
        });

        const result = await handleListApplets({
            toolArgs: {
                query: "newsroom",
                userMessage: "List newsroom applets",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.count).toBe(1);
        expect(result.data.applets[0].appMetadata).toMatchObject({
            name: "Storm Desk",
            slug: "storm-desk",
            description: "Track storm coverage",
            icon: "CloudSun",
            imageUrl: "https://images.example/storm.webp",
            imageAlt: "Storm dashboard",
            badgeLabel: "Weather desk",
            category: "weather",
            tags: ["storm", "newsroom"],
            metadataGeneratedAt: "2026-06-10T12:00:00.000Z",
            listedInStore: false,
            privateUrl: "/apps/private/applet123",
        });
        expect(result.data.description).toContain("Card name: Storm Desk");
        expect(result.data.description).toContain("not listed in app store");
    });

    test("GetApplet returns the applet record with versions", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Weather Applet",
                publishedVersionIndex: 0,
                workspacePath: "/workspace/files/applets/weather.html",
                filePath: "https://blob/weather.html",
                app: {
                    _id: "app123",
                    appletId: "applet123",
                    name: "Storm Desk",
                    slug: "storm-desk",
                    description: "Track storm coverage",
                    icon: "CloudSun",
                    imageUrl: "https://images.example/storm.webp",
                    imageAlt: "Storm dashboard",
                    badgeLabel: "Weather desk",
                    category: "weather",
                    tags: ["storm", "newsroom"],
                    metadataGeneratedAt: "2026-06-10T12:00:00.000Z",
                    listedInStore: true,
                    status: "active",
                },
                htmlVersions: [
                    {
                        timestamp: "2026-01-01T00:00:00.000Z",
                        content: "<html>v1</html>",
                    },
                    {
                        timestamp: "2026-01-02T00:00:00.000Z",
                        content: "<html>v2</html>",
                    },
                ],
            }),
        });

        const result = await handleGetApplet({
            toolArgs: {
                appletId: "applet123",
                userMessage: "Show details",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.mode).toBe("detail");
        expect(result.data.appletId).toBe("applet123");
        expect(result.data.versions).toHaveLength(2);
        expect(result.data.versions[0].isPublished).toBe(true);
        expect(result.data.publishedVersionIndex).toBe(0);
        expect(result.data.appMetadata).toMatchObject({
            name: "Storm Desk",
            slug: "storm-desk",
            imageUrl: "https://images.example/storm.webp",
            imageAlt: "Storm dashboard",
            badgeLabel: "Weather desk",
            tags: ["storm", "newsroom"],
            appStoreUrl: "/apps/storm-desk",
        });
        expect(result.data.requestedVersion).toBeUndefined();
    });

    test("GetAppletVersionSource returns saved version source metadata", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Weather Applet",
                publishedVersionIndex: 0,
                htmlVersions: [
                    { timestamp: null, content: "<html>v1</html>" },
                    { timestamp: null, content: "<html>v2</html>" },
                ],
            }),
        });

        const result = await handleGetAppletVersionSource({
            toolArgs: {
                appletId: "applet123",
                version: 2,
                userMessage: "Get v2",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            version: 2,
            isPublished: false,
            storage: "inline",
            source: "inline Mongo version content",
            contentAvailableInline: true,
        });
    });

    test("GetAppletVersionSource reports externalized version source without HTML", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Large Applet",
                publishedVersionIndex: 0,
                htmlVersions: [
                    {
                        timestamp: null,
                        content: "",
                        contentBlobPath:
                            "applets/versions/applet123/v000001.html",
                        contentSize: 900000,
                    },
                ],
            }),
        });

        const result = await handleGetAppletVersionSource({
            toolArgs: {
                appletId: "applet123",
                version: 1,
                userMessage: "Get v1",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            version: 1,
            storage: "external",
            source: "/workspace/files/applets/versions/applet123/v000001.html",
            workspacePath:
                "/workspace/files/applets/versions/applet123/v000001.html",
            contentBlobPath: "applets/versions/applet123/v000001.html",
            size: 900000,
        });
        expect(result.data.description).toContain(
            "/workspace/files/applets/versions/applet123/v000001.html",
        );
        expect(result.data.description).toContain("no download is needed");
    });

    test("GetApplet ignores version when returning applet detail", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Weather Applet",
                publishedVersionIndex: 0,
                htmlVersions: [
                    { timestamp: null, content: "<html>v1</html>" },
                    { timestamp: null, content: "<html>v2</html>" },
                ],
            }),
        });

        const result = await handleGetApplet({
            toolArgs: {
                appletId: "applet123",
                version: 0,
                userMessage: "Show details",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.mode).toBe("detail");
        expect(result.data.requestedVersion).toBeUndefined();
        expect(result.data.versions).toHaveLength(2);
    });

    test("ListApplets ignores version 0 in list mode", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "applet123",
                        name: "Weather Applet",
                        publishedVersionIndex: null,
                    },
                ],
            }),
        });

        const result = await handleListApplets({
            toolArgs: {
                version: 0,
                userMessage: "List applets",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.mode).toBe("list");
        expect(result.data.count).toBe(1);
        expect(global.fetch).toHaveBeenCalledWith("/api/canvas-applets");
    });

    test("ListApplets lists applets even when an applet is active in the canvas", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "appletCurrent",
                        name: "Current Applet",
                        publishedVersionIndex: null,
                        workspacePath: "/workspace/files/applets/current.html",
                    },
                ],
            }),
        });

        const result = await handleListApplets(
            {
                toolArgs: { userMessage: "List applets" },
            },
            {
                getActiveHtmlContent: () => ({
                    appletId: "appletActive",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.mode).toBe("list");
        expect(result.data.activeAppletId).toBe("appletActive");
        expect(result.data.applets[0].id).toBe("appletCurrent");
        expect(global.fetch).toHaveBeenCalledWith("/api/canvas-applets");
    });

    test("ListApplets with a query lists applets instead of fetching a stale active applet", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "appletCurrent",
                        name: "Arcade Pac-Man",
                        publishedVersionIndex: null,
                        workspacePath:
                            "/workspace/files/applets/arcade-pac-man.html",
                    },
                ],
            }),
        });

        const result = await handleListApplets(
            {
                toolArgs: {
                    appletId: null,
                    query: "Pac-Man",
                    userMessage: "List Pac-Man applets",
                },
            },
            {
                getActiveHtmlContent: () => ({
                    appletId: "appletDeleted",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.mode).toBe("list");
        expect(result.data.activeAppletId).toBe("appletDeleted");
        expect(result.data.applets[0].id).toBe("appletCurrent");
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith("/api/canvas-applets");
    });

    test("GetAppletState compares Draft to saved versions after normalizing applet metadata", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                    publishedVersionIndex: null,
                    app: {
                        _id: "app123",
                        appletId: "applet123",
                        name: "Storm Desk",
                        slug: "storm-desk",
                        imageUrl: "https://images.example/storm.webp",
                        imageAlt: "Storm dashboard",
                        badgeLabel: "Weather desk",
                        category: "weather",
                        tags: ["storm", "newsroom"],
                        listedInStore: false,
                    },
                    htmlVersions: [
                        {
                            content:
                                '<html><head>    <meta name="concierge-type" content="applet">\n    <meta name="applet-id" content="applet123">\n    <meta name="applet-name" content="Weather Applet">\n</head><body>forecast</body></html>',
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    "<html><head></head><body>forecast</body></html>",
            });

        const result = await handleGetAppletState(
            {
                toolArgs: { userMessage: "Check state" },
            },
            {
                getEntityId: () => "entity123",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.draft.matchesLatestVersion).toBe(true);
        expect(result.data.appMetadata).toMatchObject({
            name: "Storm Desk",
            slug: "storm-desk",
            imageAlt: "Storm dashboard",
            listedInStore: false,
        });
        expect(result.data.recommendedAction).toBe(
            "No publish action needed unless the user asks to make a saved version live",
        );
        expect(global.fetch.mock.calls[1][0]).toBe(
            "/api/workspace/file?entityId=entity123&path=%2Fworkspace%2Ffiles%2Fapplets%2Fweather.html",
        );
    });

    test("GetAppletState does not treat unavailable external published content as matching Draft", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Large Applet",
                    workspacePath: "/workspace/files/applets/large.html",
                    publishedVersionIndex: 0,
                    htmlVersions: [
                        {
                            content: "",
                            contentBlobPath:
                                "applets/versions/applet123/v000001.html",
                            contentSize: 900000,
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html><body>draft</body></html>",
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

        const result = await handleGetAppletState(
            {
                toolArgs: { userMessage: "Check state" },
            },
            {
                getEntityId: () => "entity123",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    workspacePath: "/workspace/files/applets/large.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.draft.matchesLatestVersion).toBeNull();
        expect(result.data.draft.matchesPublishedVersion).toBeNull();
        expect(result.data.versions.publishedComparison).toMatchObject({
            version: 1,
            workspacePath:
                "/workspace/files/applets/versions/applet123/v000001.html",
            readError: "Failed to fetch file from workspace (404)",
        });
        expect(result.data.recommendedAction).toBe(
            "Publish a saved version by number, or repair the externalized published version content",
        );
    });

    test("GetAppletState compares Draft against the concrete external version artifact", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Source Researcher",
                    workspacePath: "/workspace/files/applets/ask.html",
                    publishedVersionIndex: 0,
                    htmlVersions: [
                        {
                            content:
                                "<html><body>Researching your question</body></html>",
                            contentBlobPath:
                                "applets/versions/applet123/v000008.html",
                            contentHash: "stale-metadata-hash",
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    "<html><body>Researching your question</body></html>",
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    "<html><body>Preparing an source-grounded answer</body></html>",
            });

        const result = await handleGetAppletState(
            {
                toolArgs: { userMessage: "Check state" },
            },
            {
                getEntityId: () => "entity123",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    workspacePath: "/workspace/files/applets/ask.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.draft.matchesLatestVersion).toBe(false);
        expect(result.data.draft.matchesPublishedVersion).toBe(false);
        expect(result.data.versions.latestComparison).toMatchObject({
            version: 1,
            source: "/workspace/files/applets/versions/applet123/v000008.html",
            workspacePath:
                "/workspace/files/applets/versions/applet123/v000008.html",
            contentHash: "stale-metadata-hash",
        });
        expect(result.data.recommendedAction).toBe(
            "SaveAppletDraftAsVersion to checkpoint Draft",
        );
        expect(global.fetch.mock.calls[2][0]).toBe(
            "/api/workspace/file?entityId=entity123&path=%2Fworkspace%2Ffiles%2Fapplets%2Fversions%2Fapplet123%2Fv000008.html",
        );
    });

    test("DeleteApplet asks for confirmation and stops when canceled", async () => {
        window.confirm.mockReturnValue(false);

        const result = await handleDeleteApplet({
            toolArgs: {
                appletId: "applet123",
                appletName: "Weather Applet",
                userMessage: "Delete it",
            },
        });

        expect(window.confirm).toHaveBeenCalledWith(
            'Delete "Weather Applet"? This will remove the applet and its saved data.',
        );
        expect(result.success).toBe(true);
        expect(result.data.deleted).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test("DeleteApplet deletes the applet after confirmation", async () => {
        window.confirm.mockReturnValue(true);
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        const result = await handleDeleteApplet({
            toolArgs: {
                appletId: "applet123",
                appletName: "Weather Applet",
                userMessage: "Delete it",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.deleted).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/canvas-applets/applet123",
            { method: "DELETE" },
        );
    });

    test("DeleteApplet closes a matching non-active canvas tab after deletion", async () => {
        window.confirm.mockReturnValue(true);
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });
        const dispatch = jest.fn();

        const result = await handleDeleteApplet(
            {
                toolArgs: {
                    appletId: "applet-delete",
                    appletName: "Old Calculator",
                },
            },
            {
                chatId: "chat-1",
                dispatch,
                getActiveHtmlContent: () => ({
                    appletId: "applet-active",
                    title: "Current Calculator",
                }),
                getCanvasSnapshot: () => ({
                    activeTabId: "tab-active",
                    canvasTabs: [
                        {
                            id: "tab-delete",
                            content: { appletId: "applet-delete" },
                        },
                        {
                            id: "tab-active",
                            content: { appletId: "applet-active" },
                        },
                    ],
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(dispatch).toHaveBeenCalledWith({
            type: "chat/closeCanvasTabForChat",
            payload: { chatId: "chat-1", tabId: "tab-delete" },
        });
    });

    test("DeleteApplet uses toolInteraction.confirm when available", async () => {
        const confirm = jest.fn().mockResolvedValue(true);
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        const result = await handleDeleteApplet(
            {
                toolArgs: {
                    appletId: "applet123",
                    appletName: "Weather Applet",
                    userMessage: "Delete it",
                },
            },
            { toolInteraction: { confirm } },
        );

        expect(result.success).toBe(true);
        expect(confirm).toHaveBeenCalledWith({
            title: "Delete Applet?",
            description:
                'Delete "Weather Applet"? This will remove the applet and its saved data.',
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            destructive: true,
        });
        expect(window.confirm).not.toHaveBeenCalled();
    });

    test("DeleteAppletVersion deletes one saved checkpoint after confirmation", async () => {
        window.confirm.mockReturnValue(true);
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                    htmlVersions: [
                        { content: "<html>v1</html>" },
                        { content: "<html>v2</html>" },
                        { content: "<html>v3</html>" },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                    publishedVersionIndex: null,
                    versionDeleted: true,
                    deletedVersion: 2,
                    latestVersionIndex: 1,
                }),
            });

        const result = await handleDeleteAppletVersion(
            {
                toolArgs: {
                    version: 2,
                    userMessage: "Remove extra checkpoint",
                },
            },
            {
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.deleted).toBe(true);
        expect(result.data.versionDeleted).toBe(true);
        expect(result.data.deletedVersion).toBe(2);
        expect(window.confirm).toHaveBeenCalledWith(
            'Delete version 2 of "Weather Applet"? Later versions will be renumbered.',
        );
        expect(global.fetch.mock.calls[1][0]).toBe(
            "/api/canvas-applets/applet123",
        );
        expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
            deleteVersion: 2,
        });
    });

    test("UpdateAppletMetadata renames a specific applet by id", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Renamed Applet",
                publishedVersionIndex: null,
                versionSaved: false,
            }),
        });

        const result = await handleUpdateAppletMetadata({
            toolArgs: {
                appletId: "applet123",
                name: "Renamed Applet",
                userMessage: "Rename it",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.name).toBe("Renamed Applet");
        expect(result.data.updatedFields).toEqual(["name"]);
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/canvas-applets/applet123",
            expect.objectContaining({
                method: "PUT",
                headers: { "Content-Type": "application/json" },
            }),
        );
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
            name: "Renamed Applet",
        });
    });

    test("UpdateAppletMetadata forwards clearSdkSuspension", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Recovered Applet",
                updatedFields: ["clearSdkSuspension"],
            }),
        });

        const result = await handleUpdateAppletMetadata({
            toolArgs: {
                appletId: "applet123",
                clearSdkSuspension: true,
                userMessage: "Clear SDK suspension",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.updatedFields).toEqual(["clearSdkSuspension"]);
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/canvas-applets/applet123",
            expect.objectContaining({
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clearSdkSuspension: true }),
            }),
        );
    });

    test("UpdateAppletMetadata forwards all applet card metadata fields without publishing", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Weather Applet",
                app: {
                    name: "Storm Desk",
                    slug: "storm-desk",
                    listedInStore: false,
                },
            }),
        });

        const result = await handleUpdateAppletMetadata({
            toolArgs: {
                appletId: "applet123",
                appName: "Storm Desk",
                appSlug: "storm-desk",
                appDescription: "Track storm coverage",
                appIcon: "CloudSun",
                appImageUrl: "https://images.example/storm.webp",
                appImageLightUrl: "https://images.example/storm-light.webp",
                appImageDarkUrl: "https://images.example/storm-dark.webp",
                appImageAlt: "Storm dashboard",
                appBadgeLabel: "Weather desk",
                appTags: ["Storm", "Newsroom"],
                appCategory: "weather",
                appMetadataGeneratedAt: "2026-06-10T12:00:00.000Z",
                userMessage: "Update card metadata",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.updatedFields).toEqual([
            "appName",
            "appSlug",
            "appDescription",
            "appIcon",
            "appImageUrl",
            "appImageLightUrl",
            "appImageDarkUrl",
            "appImageAlt",
            "appBadgeLabel",
            "appTags",
            "appCategory",
            "appMetadataGeneratedAt",
        ]);
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
            appName: "Storm Desk",
            appSlug: "storm-desk",
            appDescription: "Track storm coverage",
            appIcon: "CloudSun",
            appImageUrl: "https://images.example/storm.webp",
            appImageLightUrl: "https://images.example/storm-light.webp",
            appImageDarkUrl: "https://images.example/storm-dark.webp",
            appImageAlt: "Storm dashboard",
            appBadgeLabel: "Weather desk",
            appTags: ["Storm", "Newsroom"],
            appCategory: "weather",
            appMetadataGeneratedAt: "2026-06-10T12:00:00.000Z",
        });
    });

    test("GenerateAppletMetadata uses the applet-specific endpoint and applies the result", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    source: "cortex",
                    metadata: {
                        name: "Storm Ops",
                        slug: "storm-ops",
                        description: "Track active storm coverage.",
                        icon: "CloudSun",
                        badgeLabel: "Weather desk",
                        category: "weather",
                        tags: ["weather", "newsroom"],
                        imageAlt: "Storm command center",
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    app: {
                        name: "Storm Ops",
                        slug: "storm-ops",
                        listedInStore: false,
                    },
                }),
            });

        const result = await handleGenerateAppletMetadata({
            toolArgs: {
                appletId: "applet123",
                userMessage: "Generate applet metadata",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.source).toBe("cortex");
        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            "/api/canvas-applets/applet123/metadata/generate",
            { method: "POST" },
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            "/api/canvas-applets/applet123",
            expect.objectContaining({
                method: "PUT",
                headers: { "Content-Type": "application/json" },
            }),
        );
        expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
            appMetadata: expect.objectContaining({
                name: "Storm Ops",
                slug: "storm-ops",
                imageAlt: "Storm command center",
            }),
        });
    });

    test("GenerateAppletImage starts applet-specific image generation without generic media tools", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                taskId: "task-1",
                jobId: "job-1",
                model: "gemini-flash-31-image",
                prompt: "Applet card prompt",
            }),
        });

        const result = await handleGenerateAppletImage({
            toolArgs: {
                appletId: "applet123",
                metadata: {
                    name: "Storm Ops",
                    description: "Track active storm coverage.",
                },
                model: "oai-gpt55",
                waitForResult: false,
                styleCues: "noir glassmorphism",
                userMessage: "Generate applet image",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.taskId).toBe("task-1");
        expect(result.data.metadataUpdated).toBe(false);
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/canvas-applets/applet123/image/generate",
            expect.objectContaining({
                method: "POST",
                headers: { "Content-Type": "application/json" },
            }),
        );
        const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(requestBody).toMatchObject({
            metadata: {
                name: "Storm Ops",
                description: "Track active storm coverage.",
            },
            styleCues: "noir glassmorphism",
        });
        expect(requestBody).not.toHaveProperty("model");
    });

    test("UpdateAppletMetadata renames the active applet and updates the open canvas tab title", async () => {
        const dispatch = jest.fn();
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Renamed Applet",
                publishedVersionIndex: null,
                versionSaved: false,
            }),
        });

        const result = await handleUpdateAppletMetadata(
            {
                toolArgs: {
                    name: "Renamed Applet",
                    userMessage: "Rename it",
                },
            },
            {
                dispatch,
                getActiveTabId: () => "tab-1",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.name).toBe("Renamed Applet");
        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch.mock.calls[0][0]).toMatchObject({
            type: "chat/updateCanvasTab",
            payload: {
                tabId: "tab-1",
                content: {
                    appletId: "applet123",
                    title: "Renamed Applet",
                    filename: "Renamed Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                },
            },
        });
    });

    test("UpdateAppletMetadata relinks the active applet to a workspace file and syncs canvas metadata", async () => {
        const dispatch = jest.fn();
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>linked file</html>",
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    publishedVersionIndex: null,
                    versionSaved: false,
                }),
            });

        const result = await handleUpdateAppletMetadata(
            {
                toolArgs: {
                    workspacePath:
                        "/workspace/files/applets/weather-linked.html",
                    userMessage: "Relink it",
                },
            },
            {
                dispatch,
                getEntityId: () => "entity123",
                getActiveTabId: () => "tab-1",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather-old.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.workspacePath).toBe(
            "/workspace/files/applets/weather-linked.html",
        );
        expect(global.fetch.mock.calls[0][0]).toBe(
            "/api/workspace/file?entityId=entity123&path=%2Fworkspace%2Ffiles%2Fapplets%2Fweather-linked.html",
        );
        expect(global.fetch.mock.calls[1][0]).toBe(
            "/api/canvas-applets/applet123",
        );
        const updateBody = JSON.parse(global.fetch.mock.calls[1][1].body);
        expect(updateBody.workspacePath).toBe(
            "/workspace/files/applets/weather-linked.html",
        );
        expect(updateBody.html).toEqual(
            expect.stringContaining('name="applet-id" content="applet123"'),
        );
        expect(dispatch).toHaveBeenCalledTimes(2);
        expect(dispatch.mock.calls[0][0]).toMatchObject({
            type: "chat/updateCanvasTab",
            payload: {
                tabId: "tab-1",
                content: {
                    appletId: "applet123",
                    title: "Weather Applet",
                    filename: "Weather Applet",
                    workspacePath:
                        "/workspace/files/applets/weather-linked.html",
                    htmlContent: updateBody.html,
                },
            },
        });
        expect(dispatch.mock.calls[1][0]).toMatchObject({
            type: "chat/refreshActiveHtmlCanvas",
            payload: {
                htmlContent: updateBody.html,
            },
        });
    });

    test("SaveAppletDraftAsVersion bumps active tab version metadata when saving a version", async () => {
        const dispatch = jest.fn();
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>saved file</html>",
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    publishedVersionIndex: null,
                    versionSaved: true,
                    latestVersionIndex: 2,
                }),
            });

        const result = await handleSaveAppletDraftAsVersion(
            {
                toolArgs: {
                    userMessage: "Save it",
                },
            },
            {
                dispatch,
                getEntityId: () => "entity123",
                getActiveTabId: () => "tab-1",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.versionSaved).toBe(true);
        expect(result.data.latestVersionNumber).toBe(3);
        expect(result.data.savedVersionNumber).toBe(3);
        expect(result.data.latestVersionIndex).toBeUndefined();
        expect(result.data.description).toContain("Saved as v3.");
        expect(dispatch.mock.calls[0][0]).toMatchObject({
            type: "chat/updateCanvasTab",
            payload: {
                tabId: "tab-1",
                content: expect.objectContaining({
                    appletId: "applet123",
                    appletVersionCount: 3,
                }),
            },
        });
        expect(dispatch.mock.calls[0][0].payload.content).toEqual(
            expect.objectContaining({
                appletVersionKey: expect.any(Number),
            }),
        );
    });

    test("SaveAppletDraftAsVersion snapshots Draft through the applet update path", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>draft</html>",
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    versionSaved: true,
                    latestVersionIndex: 2,
                }),
            });

        const result = await handleSaveAppletDraftAsVersion(
            {
                toolArgs: {
                    userMessage: "Save Draft",
                },
            },
            {
                getEntityId: () => "entity123",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(global.fetch.mock.calls[0][0]).toBe(
            "/api/canvas-applets/applet123",
        );
        expect(JSON.parse(global.fetch.mock.calls[2][1].body)).toMatchObject({
            saveVersion: true,
        });
        expect(JSON.parse(global.fetch.mock.calls[2][1].body).html).toEqual(
            expect.stringContaining("<html>draft</html>"),
        );
    });

    test("SaveAppletDraftAsVersion prefers the registry Draft path over stale active canvas context", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Text AI Launcher",
                    workspacePath:
                        "/workspace/files/applets/text-ai-launcher.html",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>Text AI Launcher draft</html>",
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Text AI Launcher",
                    versionSaved: true,
                    latestVersionIndex: 3,
                }),
            });

        const result = await handleSaveAppletDraftAsVersion(
            {
                toolArgs: {
                    userMessage: "Save Draft",
                },
            },
            {
                getEntityId: () => "entity123",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Text AI Launcher",
                    workspacePath:
                        "/workspace/files/applets/ai-pulse-command-center.backup.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(global.fetch.mock.calls[1][0]).toBe(
            "/api/workspace/file?entityId=entity123&path=%2Fworkspace%2Ffiles%2Fapplets%2Ftext-ai-launcher.html",
        );
        const updateBody = JSON.parse(global.fetch.mock.calls[2][1].body);
        expect(updateBody.html).toContain("Text AI Launcher draft");
        expect(updateBody.html).not.toContain("AI Pulse");
    });

    test("SaveAppletDraftAsVersion reads the target applet workspace when appletId differs from the active canvas", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "target-launcher",
                    name: "Text AI Launcher",
                    workspacePath:
                        "/workspace/files/applets/text-ai-launcher.html",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>launcher draft</html>",
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "target-launcher",
                    name: "Text AI Launcher",
                    versionSaved: true,
                    latestVersionIndex: 4,
                }),
            });

        const result = await handleSaveAppletDraftAsVersion(
            {
                toolArgs: {
                    appletId: "target-launcher",
                    userMessage: "Save launcher",
                },
            },
            {
                getEntityId: () => "entity123",
                getActiveHtmlContent: () => ({
                    appletId: "active-ai-pulse",
                    title: "AI Pulse Command Center",
                    workspacePath: "/workspace/files/applets/ai-pulse.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(global.fetch.mock.calls[0][0]).toBe(
            "/api/canvas-applets/target-launcher",
        );
        expect(global.fetch.mock.calls[1][0]).toBe(
            "/api/workspace/file?entityId=entity123&path=%2Fworkspace%2Ffiles%2Fapplets%2Ftext-ai-launcher.html",
        );
        expect(global.fetch.mock.calls[2][0]).toBe(
            "/api/canvas-applets/target-launcher",
        );

        const fetchedUrls = global.fetch.mock.calls.map(([url]) => String(url));
        expect(
            fetchedUrls.some((url) =>
                url.includes("%2Fworkspace%2Ffiles%2Fapplets%2Fai-pulse.html"),
            ),
        ).toBe(false);

        const updateBody = JSON.parse(global.fetch.mock.calls[2][1].body);
        expect(updateBody.saveVersion).toBe(true);
        expect(updateBody.html).toEqual(
            expect.stringContaining("<html>launcher draft</html>"),
        );
        expect(updateBody.html).not.toEqual(
            expect.stringContaining("AI Pulse Command Center"),
        );
    });

    test("PublishAppletVersion with a version publishes the immutable saved version without reading Draft", async () => {
        const dispatch = jest.fn();
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                    htmlVersions: [{ content: "<html>v1</html>" }],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    publishedVersionIndex: 0,
                    versionSaved: false,
                    latestVersionIndex: 0,
                }),
            });

        const result = await handlePublishAppletVersion(
            {
                toolArgs: {
                    version: 1,
                    userMessage: "Publish v1",
                },
            },
            {
                dispatch,
                getActiveTabId: () => "tab-1",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.publishedVersionNumber).toBe(1);
        expect(result.data.publishedVersionIndex).toBeUndefined();
        expect(result.data.description).toContain("Published version: v1.");
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
            publishVersion: 1,
        });
        expect(dispatch.mock.calls[0][0]).toMatchObject({
            type: "chat/updateCanvasTab",
            payload: {
                tabId: "tab-1",
                content: expect.objectContaining({
                    appletId: "applet123",
                    appletVersionKey: expect.any(Number),
                }),
            },
        });
        expect(dispatch.mock.calls[0][0].payload.content).not.toHaveProperty(
            "appletActiveVersionIndex",
        );
    });

    test("UnpublishApplet clears the published version", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Weather Applet",
                publishedVersionIndex: null,
                versionSaved: false,
            }),
        });

        const result = await handleUnpublishApplet(
            {
                toolArgs: {
                    userMessage: "Unpublish it",
                },
            },
            {
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
            unpublish: true,
        });
    });

    test("CopyAppletVersionToDraft restores a saved version into Draft and syncs the active canvas", async () => {
        const dispatch = jest.fn();
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                    htmlVersions: [],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    publishedVersionIndex: null,
                    versionSaved: false,
                    latestVersionIndex: 4,
                    html: "<html>v5</html>",
                }),
            });

        const result = await handleCopyAppletVersionToDraft(
            {
                toolArgs: {
                    version: 5,
                    userMessage: "Restore v5",
                },
            },
            {
                dispatch,
                getEntityId: () => "entity123",
                getActiveTabId: () => "tab-1",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.updatedFields).toEqual(["restoreVersion"]);
        expect(result.data.workspacePath).toBe(
            "/workspace/files/applets/weather.html",
        );
        expect(global.fetch.mock.calls[1][0]).toBe(
            "/api/canvas-applets/applet123",
        );
        const updateBody = JSON.parse(global.fetch.mock.calls[1][1].body);
        expect(updateBody).toEqual({ restoreVersion: 5 });
        expect(dispatch.mock.calls[0][0]).toMatchObject({
            type: "chat/updateCanvasTab",
            payload: {
                tabId: "tab-1",
                content: expect.objectContaining({
                    appletId: "applet123",
                    htmlContent: "<html>v5</html>",
                }),
            },
        });
        expect(dispatch.mock.calls[1][0]).toMatchObject({
            type: "chat/refreshActiveHtmlCanvas",
            payload: {
                htmlContent: "<html>v5</html>",
            },
        });
    });

    test("CopyAppletVersionToDraft copies an immutable version into Draft", async () => {
        const dispatch = jest.fn();
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                    htmlVersions: [],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    versionSaved: false,
                    latestVersionIndex: 4,
                    html: "<html>restored v5</html>",
                }),
            });

        const result = await handleCopyAppletVersionToDraft(
            {
                toolArgs: {
                    version: 5,
                    userMessage: "Restore v5",
                },
            },
            {
                dispatch,
                getActiveTabId: () => "tab-1",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
            restoreVersion: 5,
        });
        expect(dispatch.mock.calls[0][0]).toMatchObject({
            type: "chat/updateCanvasTab",
            payload: {
                tabId: "tab-1",
                content: expect.objectContaining({
                    appletActiveVersionIndex: null,
                    appletActiveVersionNumber: null,
                    appletIsViewingDraft: true,
                    htmlContent: "<html>restored v5</html>",
                }),
            },
        });
        expect(dispatch.mock.calls[1][0]).toMatchObject({
            type: "chat/refreshActiveHtmlCanvas",
            payload: {
                htmlContent: "<html>restored v5</html>",
            },
        });
    });

    test("OpenAppletDraft opens the existing Draft without copying a saved version", async () => {
        const dispatch = jest.fn();
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet123",
                    name: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                    htmlVersions: [],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>draft</html>",
            });

        const result = await handleOpenAppletDraft(
            {
                toolArgs: {
                    userMessage: "Prepare this applet for editing",
                },
            },
            {
                dispatch,
                getEntityId: () => "entity123",
                getActiveTabId: () => "tab-1",
                getActiveHtmlContent: () => ({
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: "/workspace/files/applets/weather.html",
                    appletActiveVersionNumber: 6,
                    appletIsViewingDraft: false,
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.workspacePath).toBe(
            "/workspace/files/applets/weather.html",
        );
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch.mock.calls[1][0]).toBe(
            "/api/workspace/file?entityId=entity123&path=%2Fworkspace%2Ffiles%2Fapplets%2Fweather.html",
        );
        expect(dispatch.mock.calls[0][0]).toMatchObject({
            type: "chat/updateCanvasTab",
            payload: {
                content: expect.objectContaining({
                    appletActiveVersionIndex: null,
                    appletActiveVersionNumber: null,
                    appletIsViewingDraft: true,
                    htmlContent: "<html>draft</html>",
                }),
            },
        });
        expect(dispatch.mock.calls[1][0]).toMatchObject({
            type: "chat/refreshActiveHtmlCanvas",
            payload: {
                htmlContent: "<html>draft</html>",
            },
        });
    });
});
