---
id: "using-automations"
title: "Using Automations"
category: "automations"
date: "2026-05-04"
---

## Using Automations

Automations let Concierge run a saved set of instructions on a schedule. Each automation has an `AUTOMATION.md` file, optional supporting files, a schedule, and a full run history.

### Creating An Automation

1. Open **Automations** from the sidebar.
2. Click **New automation**.
3. Describe what you want Concierge to do, including any timing hint such as "every weekday at 8am".
4. Click **Suggest with AI** to let Concierge draft the name, schedule, output type, and instructions, or fill in the details yourself.
5. Click **Create** to save it, or **Create & customize** to open the editor immediately.

### Scheduling Options

Use **Hourly** for interval-based runs, or turn on **Run on clock time** and set minute `0` to run at the top of each matching hour. Use **Daily** when the automation should run every day at one or more times, such as `06:00` and `18:00`. Use **Weekly** when it should run on selected weekdays at the same set of times.

### Supporting Files

Upload supporting files when the automation needs reusable inputs, examples, or reference material. Text-based files can be read as context when the automation runs.

### Connected Services

Automations can use the same connected services as chat, including Jira, Confluence, Slack, and GitHub. Connect the service from the MCP settings first, then reference it in the automation instructions.

Before each run, Concierge refreshes connected-service credentials in the background when the service supports refresh tokens. If a service cannot be refreshed, the automation will not open an interactive sign-in window; reconnect the service and run the automation again.

### HTML Output

Enable **Produce HTML output** when you want each run to create a simple rendered result, like a daily digest. Concierge stores the HTML with the run so you can review it later.

### Pinning Results

For HTML-producing automations, enable **Pin latest HTML result to sidebar**. The sidebar link always opens the latest successful HTML output, while the Automations page keeps the full run history.

Enable **Show as a widget on the home screen** when you want the latest run to appear on Home. Home widgets show the newest automation output, can be opened full screen, and update as new runs finish.
