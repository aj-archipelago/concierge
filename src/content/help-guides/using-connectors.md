---
id: "using-connectors"
title: "Using Connectors"
category: "connectors"
date: "2026-05-27"
---

## Using Connectors

Connectors let Concierge use external tools and data through Model Context Protocol (MCP) servers that you add to your account.

### Opening Connectors

- Open a chat
- Select the plug icon in the chat toolbar
- Review the custom MCP servers already connected to your account

### Adding a Custom MCP Server

- Select **Add server**
- Enter a name and the MCP server URL
- Paste a bearer token if the server uses token authentication
- Leave the token blank and select **Add & connect OAuth** when the server supports OAuth

### Managing Connectors

- Connected servers are available to chat after they are added
- Use **Connect OAuth** or **Reconnect OAuth** when a server needs authorization
- Remove a connector when you no longer want Concierge to use that server

### Notes

- Concierge blocks unsafe private, localhost, link-local, and metadata URLs for custom MCP servers
- Production custom server URLs must use HTTPS unless private URLs are explicitly allowed for local development
- Tokens and refresh material are stored on the server and are not returned to the browser
