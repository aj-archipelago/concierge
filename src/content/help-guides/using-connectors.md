---
id: "using-connectors"
title: "Using Connectors"
category: "connectors"
date: "2026-05-04"
---

## Using Connectors

Connectors link Concierge to external tools so the AI can search, read, and act on data from those services directly in chat.

### Opening Connectors

- Click your **profile avatar** → **Settings** → **Capabilities** → **Connectors**
- Or type `/connectors` in the chat input as a shortcut

### Available Connectors (Quick connect)

| Connector                       | What it enables                                                    |
| ------------------------------- | ------------------------------------------------------------------ |
| **Atlassian JIRA & Confluence** | Search issues, create tickets, read and update Confluence pages    |
| **Slack**                       | Search messages, channels, and users in your workspace (read-only) |
| **GitHub**                      | Browse repositories, issues, pull requests, and code               |

These presets use OAuth: click **Connect**, complete sign-in in the browser window, and return to Concierge when prompted. Some presets may only be available after an administrator enables the required OAuth configuration for your environment.

### Applets: calling the Jira REST API directly

**Applets** can use `ConciergeSDK.services.getAccessToken({ service: "atlassian" })` and then call Jira's Cloud REST API with the returned `metadata.baseUrl` and `Authorization` header. For **JQL issue search**, use **enhanced JQL search** at `/rest/api/3/search/jql` (`GET`, or `POST` with a JSON body for longer queries). Do **not** use legacy `GET`/`POST` `/rest/api/3/search` — that API was **removed** and responds with **410**. Read the official **[Issue search reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)** and migration notice **[CHANGELOG-2046](https://developer.atlassian.com/changelog/#CHANGE-2046)** before implementing search so generated code stays current.

### Custom MCP servers (any URL)

You can add **any** MCP server that speaks HTTP (streamable HTTP), not only the presets above.

1. Open the Connectors dialog (`/connectors`)
2. Under **Custom servers**, click **Add server**
3. Enter a **name** (shown in **Your connectors** exactly as you typed it)
4. Enter the **MCP URL** — the full endpoint (must start with `http://` or `https://`)
5. Choose how to authenticate:
    - Paste a **Bearer token** if that server gives you one
    - Or leave the token blank and click **Add & connect OAuth** to use OAuth 2.1
6. Complete the OAuth popup if prompted, or click **Add** to save the server without OAuth

Concierge also generates an internal ID from the name (lowercased, with non-alphanumeric characters changed to dashes), e.g. `custom-my-server`. If you reuse a name, a numeric suffix is added (`custom-my-server-2`, etc.) so nothing is overwritten.

For custom server OAuth, Concierge discovers the server's OAuth metadata, dynamically registers itself to get a client ID, and uses PKCE for the authorization-code exchange. The server must expose standard OAuth authorization-server metadata and a dynamic client registration endpoint.

**Security:** Only add MCP servers you trust. Prefer **HTTPS**. Treat tokens like passwords.

### Connecting a preset (Quick connect)

1. Open **Settings** → **Capabilities** → **Connectors**
2. Find the service under **Quick connect**
3. Click **Connect** and finish OAuth in the popup or redirect
4. If a preset ever asks for a token in the dialog, paste it and click **Save** (follow the on-screen link for “Get token” when shown)
5. Connected services appear under **Your connectors** with a status (connected, expired token, etc.)

### Using a Connector in Chat

Once connected, just ask Concierge naturally:

- "Find all open JIRA tickets assigned to me"
- "Search Slack for messages about the Q2 report"
- "Show me the open pull requests in the design-system repo"

Concierge will use the connected service to fetch real data and include it in its response.

### Disconnecting a Connector

- Open **Settings** → **Capabilities** → **Connectors**
- Find the connector under **Your connectors**
- Click the **trash icon** to remove it

### Tips

- Connectors are linked to your account and persist across sessions
- If a connector shows **Reconnect** or an expired state, open Connectors and connect again; to change the token for a custom server, remove it and add it again with the new token
- Custom MCP servers can use either a manually pasted Bearer token or OAuth 2.1 with dynamic client registration
- Connectors use the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) under the hood
