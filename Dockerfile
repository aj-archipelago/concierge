FROM ubuntu:20.04 AS base

RUN apt-get update && apt-get install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get install -y nodejs

FROM base AS deps
WORKDIR /app

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
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
ARG CORTEX_MEDIA_API_URL
ENV CORTEX_MEDIA_API_URL=$CORTEX_MEDIA_API_URL
ARG NEXT_PUBLIC_AMPLITUDE_API_KEY
ENV NEXT_PUBLIC_AMPLITUDE_API_KEY=$NEXT_PUBLIC_AMPLITUDE_API_KEY
ARG NEXT_PUBLIC_ATLASSIAN_CLIENT_ID
ENV NEXT_PUBLIC_ATLASSIAN_CLIENT_ID=$NEXT_PUBLIC_ATLASSIAN_CLIENT_ID
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

RUN npm run build --legacy-peer-deps

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN apt-get update && apt-get install -y curl libssl1.1 \
    && curl -O https://downloads.mongodb.com/linux/mongo_crypt_shared_v1-linux-x86_64-enterprise-ubuntu2004-7.0.12.tgz \
    && mkdir -p /app/mongo_crypt_lib \
    && tar -xvf mongo_crypt_shared_v1-linux-x86_64-enterprise-ubuntu2004-7.0.12.tgz -C /app/mongo_crypt_lib --strip-components=1 \
    && rm mongo_crypt_shared_v1-linux-x86_64-enterprise-ubuntu2004-7.0.12.tgz \
    && chown -R nextjs:nodejs /app/mongo_crypt_lib \
    && chmod 755 /app/mongo_crypt_lib/mongo_crypt_v1.so \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV MONGOCRYPT_PATH=/app/mongo_crypt_lib/mongo_crypt_v1.so

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]