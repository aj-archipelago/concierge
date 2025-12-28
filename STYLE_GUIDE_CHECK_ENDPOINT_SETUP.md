# Style Guide Check Endpoint - Files and Setup

## Endpoint Location

`app/api/style-guide-check/route.js`

## Dependencies

### 1. **Database Models** (Mongoose)

#### LLM Model (`app/api/models/llm.js`)

- **Purpose**: Stores AI model configurations
- **Schema Fields**:
    - `identifier`: String (indexed)
    - `name`: String (required)
    - `cortexPathwayName`: String (required) - GraphQL pathway name
    - `cortexModelName`: String (required) - Model name for Cortex
    - `isDefault`: Boolean - Marks default LLM
    - `isAgentic`: Boolean - Whether model uses agentic pathway
- **Setup**: Seeded via `instrumentation.js` from `config.data.llms`
- **Required**: At least one LLM with `isDefault: true` in database

#### Run Model (`app/api/models/run.js`)

- **Purpose**: Tracks style guide check executions
- **Schema Fields**:
    - `owner`: ObjectId (ref: User, indexed)
    - `output`: String - Corrected text result
    - `citations`: Array - Citations from LLM
    - `expireAt`: Date - Auto-expires after 15 days
- **Setup**: Auto-created when endpoint runs
- **Note**: Style guide checks do not associate runs with workspaces

#### User Model (`app/api/models/user.mjs`)

- **Purpose**: User authentication and context
- **Schema Fields**:
    - `userId`, `username`, `name`
    - `contextId`: String - User's file context ID
    - `contextKey`: String - Encryption key for user files
- **Setup**: Auto-created on first login via `getCurrentUser()`

### 2. **Authentication** (`app/api/utils/auth.js`)

#### `getCurrentUser()`

- **Purpose**: Gets authenticated user from request
- **Auth Sources**:
    1. Azure App Service headers (`X-MS-CLIENT-PRINCIPAL-ID`, `X-MS-CLIENT-PRINCIPAL-NAME`)
    2. Local dev token cookie (`local_auth_token`)
- **Setup**:
    - Production: Azure App Service handles auth headers
    - Local dev: Set `local_auth_token` cookie (see `app/api/auth/test/route.js`)
- **Returns**: User object with `_id`, `contextId`, `contextKey`
- **Required**: User must be authenticated

### 3. **File Utilities** (`app/api/utils/llm-file-utils.js`)

#### `prepareFileContentForLLM(files, workspaceId, userContextId, fetchShortLivedUrls, useCompoundContextId)`

- **Purpose**: Prepares file objects for LLM chat history
- **File Types**:
    - Style guide files: Files with `_id` (use "style-guide-check" as context)
    - User files: Files without `_id` (use `userContextId` or compound context)
- **URL Handling**:
    - Fetches 5-minute short-lived URLs via `fetchShortLivedUrl()`
    - Falls back to original URLs if short-lived fetch fails
- **Returns**: Array of stringified file content objects for chat history
- **Note**: Style guide files always use "style-guide-check" as the workspaceId

#### `buildAgentContext({ workspaceId, workspaceContextKey, userContextId, userContextKey, includeCompoundContext })`

- **Purpose**: Builds agentContext array for agentic LLMs
- **Context Types**:
    - Style guide context: Always uses "style-guide-check" as workspaceId
    - User context: Standalone user context (optional)
- **Returns**: Array of context objects with `contextId`, `contextKey`, `default` flag
- **Note**: Style guide checks always use "style-guide-check" context, no workspace context keys

### 4. **GraphQL Client** (`src/graphql.js`)

#### `getClient(serverUrl, useBlueGraphQL)`

- **Purpose**: Creates Apollo Client for Cortex GraphQL API
- **Configuration**:
    - URL: `CORTEX_GRAPHQL_API_URL` env var or `http://localhost:4000/graphql`
    - Supports HTTP and WebSocket links
    - Error handling for auth (401) and network errors
- **Setup**:
    - Set `CORTEX_GRAPHQL_API_URL` environment variable
    - Format: `https://<site>.azure-api.net/graphql?subscription-key=<key>`

#### `QUERIES.getWorkspacePromptQuery(pathwayName)`

- **Purpose**: Generates GraphQL query for non-agentic LLMs
- **Variables**: `chatHistory`, `async`, `model`

#### `QUERIES.getWorkspaceAgentQuery(pathwayName)`

- **Purpose**: Generates GraphQL query for agentic LLMs
- **Variables**: `chatHistory`, `async`, `model`, `agentContext`, `researchMode`

### 5. **Database Connection** (`src/db.mjs`)

#### `connectToDatabase()`

- **Purpose**: Connects to MongoDB with optional encryption
- **Configuration**:
    - `MONGO_URI`: MongoDB connection string (required)
    - `MONGO_ENCRYPTION_KEY`: Base64 encryption key (optional)
    - `MONGO_DATAKEY_UUID`: Data key UUID (optional)
- **Setup**:
    - Called automatically via Next.js `instrumentation.js`
    - Connection is shared across all API routes
- **Required**: MongoDB must be running and accessible

## Setup Requirements

### Environment Variables

```bash
# Required
MONGO_URI=mongodb://localhost:27017/labeeb  # or your MongoDB connection string
CORTEX_GRAPHQL_API_URL=https://<site>.azure-api.net/graphql?subscription-key=<key>

# Optional (for encryption)
MONGO_ENCRYPTION_KEY=<base64-encoded-key>
MONGO_DATAKEY_UUID=<uuid>
MONGOCRYPT_PATH=/path/to/mongocryptd
```

### Database Setup

1. **MongoDB Connection**:
    - Database connection is established via `instrumentation.js` on app startup
    - Connection is shared across all API routes

2. **LLM Seeding**:
    - LLMs are seeded from `config.data.llms` in `instrumentation.js`
    - At least one LLM must have `isDefault: true`
    - LLMs are upserted based on `identifier` field

3. **User Creation**:
    - Users are auto-created on first authentication
    - User gets `contextId` and optionally `contextKey` for file encryption

### Authentication Setup

**Production (Azure)**:

- Azure App Service automatically sets auth headers
- No additional setup needed

**Local Development**:

- Use `/api/auth/test` endpoint to set local auth token
- Or manually set `local_auth_token` cookie with user data

### Cortex API Setup

- Cortex GraphQL API must be running and accessible
- API must support the pathway specified in LLM's `cortexPathwayName`
- For agentic LLMs, Cortex must support `agentContext` parameter

## Style Guide File Upload System

### Overview

Users can upload style guide files that are used to check text against specific style rules. Style guides are **system-wide** resources that can be selected when checking text.

### File Upload Flow

1. **Admin Uploads Style Guide** (`/admin/style-guides`):
    - Admin navigates to `/admin/style-guides` page
    - Uploads a file (PDF, DOCX, TXT, etc.) via the admin UI
    - File is uploaded to `/api/style-guides` (POST with multipart/form-data)
    - File is stored in **"style-guide-check" context** (permanent storage)
    - File metadata is saved to MongoDB `File` model

2. **Create Style Guide Record**:
    - After file upload, admin submits style guide metadata:
        - `name`: Display name for the style guide
        - `description`: Optional description
        - `fileId`: ID of the uploaded file
    - Style guide is saved to `StyleGuide` model
    - Style guide is marked as `isActive: true`

3. **User Selects Style Guide**:
    - In `NewStyleGuideModal`, users see a dropdown of available style guides
    - Style guides are fetched from `/api/style-guides` (GET)
    - Only `isActive: true` style guides are shown
    - User selects a style guide from the dropdown

4. **File Included in Check**:
    - When user clicks "Check Style Guide", `prepareFilesData()` builds file array
    - Selected style guide's file is included with:
        - `url`: File URL
        - `gcs`: Google Cloud Storage URL
        - `displayFilename`: Display name
        - `_id`: File ID (marks it as workspace artifact)
    - Files array is sent to `/api/style-guide-check` endpoint

5. **Endpoint Processes Files**:
    - `prepareFileContentForLLM()` processes the style guide file
    - Since file has `_id`, it's treated as a workspace artifact
    - Always uses "style-guide-check" contextId (endpoint is workspace-independent)
    - Fetches 5-minute short-lived URL for security
    - File is included in LLM chat history

### Files and Models

#### StyleGuide Model (`app/api/models/style-guide.js`)

- **Schema**:
    - `name`: String (required) - Display name
    - `description`: String (optional)
    - `file`: ObjectId (ref: File, required) - The uploaded file
    - `isActive`: Boolean (default: true) - Whether style guide is available
    - `uploadedBy`: ObjectId (ref: User, required) - Admin who uploaded it
- **Indexes**: `uploadedBy`, `isActive`, `createdAt`

#### File Model (`app/api/models/file.js`)

- Stores file metadata and references to Cortex storage
- Files uploaded for style guides use:
    - `contextId`: "style-guide-check" (dedicated style guide context)
    - `permanent`: true (permanent storage)
    - Stored in Cortex file system

### API Endpoints

#### `GET /api/style-guides`

- Returns all active style guides
- Populates `file` and `uploadedBy` fields
- Used by UI to show available style guides

#### `POST /api/style-guides`

- **Admin only** (requires `role: "admin"`)
- Two modes:
    1. **File Upload** (multipart/form-data):
        - Uploads file to Cortex storage
        - Returns file object with `_id`
    2. **Create Style Guide** (application/json):
        - Creates StyleGuide record
        - Links uploaded file to style guide
        - Returns created style guide

#### `DELETE /api/style-guides/[id]`

- **Admin only**
- Deletes style guide (sets `isActive: false` or removes record)

### File Storage

- **Storage Location**: Cortex file system (via `handleStreamingFileUpload`)
- **Context**: "style-guide-check" (dedicated context for style guide files)
- **Permanent**: Yes (style guides don't expire)
- **Access**: Files are accessed via short-lived URLs (5-minute expiry) when checking text
- **Isolation**: Style guide files are isolated from workspace and user file contexts

### File Migration

- **Migration Function**: `app/api/utils/style-guide-migration.js`
- **Purpose**: Migrates existing style guide files from old contexts ("system", "styleguidechecker") to "style-guide-check"
- **When**: Runs automatically on app startup via `instrumentation.js`
- **How**: Uses `validateAndRefreshFile()` utility (same pattern as workspace file migration)
    - Checks if file exists in "style-guide-check" context
    - If not, downloads from old context or file URL and re-uploads to new context
    - Updates file metadata with new URLs and hash if needed
- **Logging**: Logs migration results (migrated count, error count)

### UI Components

1. **Admin Page** (`app/admin/style-guides/page.js`):
    - Lists all style guides
    - Upload new style guide files
    - Delete style guides
    - Admin-only access

2. **Style Guide Selector** (`src/components/editor/NewStyleGuideModal.js`):
    - Dropdown to select style guide
    - Shows style guide name and description
    - Only shows active style guides
    - Available to all authenticated users

## Request Flow

1. **Request received** → Parse body (`text`, `llmId`, `files`)
    - **Note**: `workspaceId` is not accepted - style guide checker is workspace-independent

2. **Authentication** → `getCurrentUser()` gets user from headers/cookies

3. **LLM Selection**:
    - If `llmId` provided → Find LLM by ID
    - Otherwise → Find default LLM (`isDefault: true`)

4. **File Preparation** (if files provided):
    - `prepareFileContentForLLM()` processes files
    - For style guide files (have `_id`): Always uses "style-guide-check" contextId
    - Fetches short-lived URLs for security (5-minute expiry)
    - No compound context needed (style guide files are not user-specific)

5. **Query Building**:
    - Build system prompt (includes style guide instructions if files provided)
    - System prompt tells LLM to prioritize style guide rules
    - Build chat history with system message + user text + style guide files
    - If agentic: Build `agentContext` array with "style-guide-check" context

6. **GraphQL Query**:
    - Select query type (agentic vs non-agentic)
    - Execute query via `getClient().query()`
    - Extract result from `response.data[pathwayName].result`

7. **Run Tracking**:
    - Create Run record with output and owner
    - Run is not associated with any workspace
    - Run auto-expires after 15 days

8. **Response**:
    - Return `{ originalText, correctedText, runId }`

## File Context System

The style guide checker uses a dedicated context for file storage:

- **Style guide files**: Always stored in "style-guide-check" context
- **Isolation**: Style guide files are completely separate from workspace and user file contexts
- **Access**: Files are accessed via short-lived URLs (5-minute expiry) for security
- **No workspace dependency**: The endpoint does not require or use workspace IDs
- **Migration**: Existing files are automatically migrated from old contexts on app startup

This ensures style guide files are:

- Accessible to all authenticated users
- Isolated from workspace-specific files
- Managed independently of workspace lifecycle
- Automatically migrated from legacy contexts
