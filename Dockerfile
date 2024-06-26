FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN apk add --update python3 make g++\
   && rm -rf /var/cache/apk/*

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm config set registry https://registry.npmjs.org/ && npm ci --legacy-peer-deps --loglevel verbose || true; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi
RUN  cat /root/.npm/_logs/* 

# COPY sshd_config /etc/ssh/
# COPY entrypoint.sh ./

# # Add SSH and expose the SSH port
# RUN apk add openssh \
#     && echo "root:Docker!" | chpasswd \
#     && chmod +x ./entrypoint.sh \
#     && cd /etc/ssh/ \
#     && ssh-keygen -A

# EXPOSE 8000 2222

# ENTRYPOINT [ "./entrypoint.sh" ]

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

# read args and set env variables
ARG CORTEX_GRAPHQL_API_URL
ENV CORTEX_GRAPHQL_API_URL=$CORTEX_GRAPHQL_API_URL
ARG CORTEX_MEDIA_API_URL
ENV CORTEX_MEDIA_API_URL=$CORTEX_MEDIA_API_URL
ARG NEXT_PUBLIC_AMPLITUDE_API_KEY
ENV NEXT_PUBLIC_AMPLITUDE_API_KEY=$NEXT_PUBLIC_AMPLITUDE_API_KEY
ARG NEXT_PUBLIC_ATLASSIAN_CLIENT_ID
ENV NEXT_PUBLIC_ATLASSIAN_CLIENT_ID=$NEXT_PUBLIC_ATLASSIAN_CLIENT_ID
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

RUN npm run build --legacy-peer-deps

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
# set hostname to localhost
ENV HOSTNAME "0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]