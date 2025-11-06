FROM node:24-bullseye-slim AS base

RUN corepack enable

FROM base AS production_buildstage

WORKDIR /home/node/app
COPY package.json package-lock.json ./

RUN npm ci

COPY --chown=node:node . ./
RUN npm run build

FROM base AS production

RUN apt-get update && \
    apt-get install -y postgresql-client && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /home/node/app && \
    chown node:node /home/node/app

ENV NODE_ENV=production

WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json entrypoint.sh ./
RUN chmod +x entrypoint.sh

USER node
RUN npm ci

COPY --from=production_buildstage /home/node/app/dist /home/node/app/dist

CMD ["./entrypoint.sh"]

FROM base AS development

WORKDIR /home/node/app
