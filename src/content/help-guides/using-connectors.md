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

### Tools on your computer

When your administrator enables **Concierge Companion**, use **Download for Mac** or **Download for Windows** in Connectors and open the installer. The Mac download works on Apple silicon and Intel. Windows installs for your account and opens the app when finished. Your operating system may ask you to confirm installation or opening the app.

Return to Concierge, select **Connect this computer** (or **Open Companion**), and approve the account shown in the companion. Your site and account are filled in automatically. Keep the page open: it updates when the computer is connected. If the setup link expires, select Open Companion again. An installed companion only needs the connect/open action and approval. Manual address and code entry remain under Advanced settings / Troubleshooting as a fallback.

Choose **Choose a folder** to let Concierge read and edit files in folders you select. This connector is bundled: there are no commands, downloads, or JSON files to configure. For other applications, add their MCP address under **Custom servers**. Local and private-network addresses automatically continue through Companion; approve the displayed address there. Use **Use this computer’s connection** for a hostname available only through your VPN. The app also accepts HTTPS cloud servers. Cloud presets keep using their existing connection independently of your computer.

HTTP and SSE are supported in Companion with a supplied bearer token. Interactive OAuth uses Concierge’s cloud connector flow. Advanced native settings allow reviewed JSON imports for local programs using stdio. The companion does not install Premiere or its MCP extension; those must already be installed.

After pairing, Companion starts at sign-in and runs in the background. Computer tools need the computer awake, online, and running the relevant app. Scheduled and unattended jobs use cloud connectors, not Companion. Saved server credentials stay encrypted on the computer; a token entered in web setup passes through an encrypted temporary setup record. Tool descriptions, arguments, and results pass through Cortex to fulfill your requests.

Signed customer builds download updates automatically and install them when you quit Companion. **Restart to update** is available when no tool is running. Local unsigned builds do not update automatically.

Use the menu bar or system tray to pause the companion. **Disconnect** in Concierge removes that computer's authorization immediately. A tool already running in a local app may finish. If a connection drops during an edit, check the local app before retrying; Concierge does not automatically repeat the call.

### Custom MCP servers

You can add **any** MCP server that speaks HTTP (streamable HTTP), not only the presets above.

1. Open the Connectors dialog (`/connectors`)
2. Under **Custom servers**, click **Add server**
3. Enter a **name** (shown in **Your connectors** exactly as you typed it)
4. Enter the **MCP URL** — the full endpoint (must start with `http://` or `https://`)
5. Choose how to authenticate:
    - Paste a **Bearer token** if that server gives you one
    - Or leave the token blank and click **Add & connect OAuth** to use OAuth 2.1
6. Complete the OAuth popup if prompted, or click **Add** to save the server without OAuth. For a private address, choose **Continue in Companion**, then approve it in the app.

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

### Reconnecting a custom server from chat

If a custom OAuth connector has expired, you can ask Concierge to reconnect it. Complete the sign-in popup, then send another message to load the restored tools. Allow popups if your browser blocks the window. Closing the window, denying access, or timing out does not confirm a connection; try again or reconnect from the Connectors dialog. Custom servers that use a manually entered token still need their token updated in Connectors.
