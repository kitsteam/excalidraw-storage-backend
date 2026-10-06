ARG NODE_VERSION=24
ARG ALPINE_VERSION=3.21
ARG PNPM_VERSION=10.33.4

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base

ENV APP_PATH=/home/node/app
WORKDIR $APP_PATH

RUN corepack enable \
 && chown node:node $APP_PATH

USER node

ARG PNPM_VERSION
RUN corepack prepare pnpm@${PNPM_VERSION} --activate


FROM base AS builder

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY --chown=node:node . ./
RUN pnpm run build


FROM base AS development


FROM base AS production

USER root
RUN apk add --no-cache tini
USER node

ENV NODE_ENV=production

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder --chown=node:node $APP_PATH/dist ./dist

COPY --chown=node:node --chmod=755 entrypoint.prod.sh ./

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.prod.sh"]
