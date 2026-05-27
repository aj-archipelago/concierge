FROM ubuntu:24.04 AS base

RUN apt-get update && apt-get install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs
RUN curl -fsSL https://registry.npmjs.org/npm/-/npm-11.14.1.tgz -o /tmp/npm-11.14.1.tgz \
    && mkdir -p /opt/npm-11.14.1 \
    && tar -xzf /tmp/npm-11.14.1.tgz -C /opt/npm-11.14.1 --strip-components=1 \
    && node /opt/npm-11.14.1/bin/npm-cli.js --version \
    && printf '%s\n' '#!/bin/sh' 'exec node /opt/npm-11.14.1/bin/npm-cli.js "$@"' > /usr/local/bin/npm \
    && printf '%s\n' '#!/bin/sh' 'exec node /opt/npm-11.14.1/bin/npx-cli.js "$@"' > /usr/local/bin/npx \
    && chmod +x /usr/local/bin/npm /usr/local/bin/npx \
    && rm /tmp/npm-11.14.1.tgz
FROM base AS deps
WORKDIR /app

COPY .npmrc package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm config set registry https://registry.npmjs.org/ && npm ci --legacy-peer-deps --loglevel verbose || true; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

FROM base AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1

ARG CORTEX_GRAPHQL_API_URL
ENV CORTEX_GRAPHQL_API_URL=$CORTEX_GRAPHQL_API_URL
ARG CORTEX_GRAPHQL_API_BLUE_URL
ENV CORTEX_GRAPHQL_API_BLUE_URL=$CORTEX_GRAPHQL_API_BLUE_URL
ARG CORTEX_MEDIA_API_URL
ENV CORTEX_MEDIA_API_URL=$CORTEX_MEDIA_API_URL
ARG NEXT_PUBLIC_AMPLITUDE_API_KEY
ENV NEXT_PUBLIC_AMPLITUDE_API_KEY=$NEXT_PUBLIC_AMPLITUDE_API_KEY
ARG NEXT_PUBLIC_ATLASSIAN_CLIENT_ID
ENV NEXT_PUBLIC_ATLASSIAN_CLIENT_ID=$NEXT_PUBLIC_ATLASSIAN_CLIENT_ID
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

RUN npm run prebuild --legacy-peer-deps && npm run build --legacy-peer-deps

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production

# Install system dependencies first (cached)
RUN apt-get update && apt-get install -y curl libssl3 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Setup mongo_crypt_lib once (cached)
RUN ARCH=$(uname -m) \
    && case "$ARCH" in \
         x86_64) MONGO_ARCH="x86_64" ;; \
         aarch64|arm64) MONGO_ARCH="aarch64" ;; \
         *) echo "Unsupported architecture: $ARCH. Supported architectures are x86_64 and aarch64/arm64." >&2; exit 1 ;; \
       esac \
    && curl -O https://downloads.mongodb.com/linux/mongo_crypt_shared_v1-linux-${MONGO_ARCH}-enterprise-ubuntu2404-8.0.4.tgz \
    && mkdir -p /tmp/mongo_crypt \
    && tar -xf mongo_crypt_shared_v1-linux-${MONGO_ARCH}-enterprise-ubuntu2404-8.0.4.tgz -C /tmp/mongo_crypt \
    && mkdir -p /app/mongo_crypt_lib \
    && find /tmp/mongo_crypt -name "mongo_crypt_v1.so" -exec mv {} /app/mongo_crypt_lib/mongo_crypt_v1.so \; \
    && rm -rf /tmp/mongo_crypt mongo_crypt_shared_v1-linux-${MONGO_ARCH}-enterprise-ubuntu2404-8.0.4.tgz \
    && chmod 755 /app/mongo_crypt_lib/mongo_crypt_v1.so

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set ownership (only needs to happen once)
RUN chown -R nextjs:nodejs /app/mongo_crypt_lib

COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

ENV MONGOCRYPT_PATH=/app/mongo_crypt_lib/mongo_crypt_v1.so

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
