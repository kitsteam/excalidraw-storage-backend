FROM node:24-bookworm-slim AS base

RUN corepack enable

FROM base AS production_buildstage

WORKDIR /home/node/app
COPY package.json package-lock.json ./

RUN npm ci

COPY --chown=node:node . ./
RUN npm run build

# Prune dev dependencies after build
RUN npm prune --omit=dev

FROM base AS production

RUN apt-get update && \
    apt-get install -y postgresql-client && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /home/node/app && \
    chown node:node /home/node/app

ENV NODE_ENV=production

WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json entrypoint.sh ./
RUN chmod +x entrypoint.sh && sed -i 's/\r$//' entrypoint.sh

USER node

# Copy pruned node_modules and dist from build stage instead of running npm ci again
COPY --from=production_buildstage --chown=node:node /home/node/app/node_modules /home/node/app/node_modules
COPY --from=production_buildstage --chown=node:node /home/node/app/dist /home/node/app/dist

CMD ["./entrypoint.sh"]

FROM base AS development

WORKDIR /home/node/app
