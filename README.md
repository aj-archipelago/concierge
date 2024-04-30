# Concierge

Concierge is an open-source web application that provides AI applications to enterprise customers for a company's internal use. Concierge encapsulates functions like document translation, copy editing, summarization, headline generation, tagging, entity extraction, etc. into easy-to-use task-specific interfaces rather than just making the functionality available through a chat-style prompting interface. Concierge is a one-stop shop for LLM-based AI functionality at our network. Concierge is built on top of [Cortex](https://github.com/aj-archipelago/cortex) - our open-source graphQL middle tier for AI.

## Environment setup

### Envrionment variables

Here is a list of runtime environment variables that concierge can read:

- `SERVER_URL`: this is the URL at which the NextJS app is running, e.g. `https://<site>.azurewebsites.net`. Defaults to `http://localhost:3000` in development. Do not include a trailing slash when specifying this URL.
- `CORTEX_GRAPHQL_API_URL`: the full GraphQL URL of the Cortex deployment, e.g. `https://<site>.azure-api.net/graphql?subscription-key=<key>`
- `CORTEX_MEDIA_API_URL`: the full URL of the Cortex media helper app, e.g. `https://<site>.azure-api.net/media-helper?subscription-key=<key>`
- `JIRA_CLIENT_SECRET`: required if you'd like to connect to JIRA (to create tickets)
- `MONGO_URI`: the mongo DB connection string

The following is a list of build-time environment variables:

- `NEXT_PUBLIC_ATLASSIAN_CLIENT_ID`: required if you'd like to connect to JIRA
- `NEXT_PUBLIC_AMPLITUDE_API_KEY`: Amplitude key for analytics

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.
