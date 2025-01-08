FROM node:22-bullseye-slim AS base

FROM base AS production_buildstage

WORKDIR /home/node/app
COPY package.json package-lock.json ./

RUN npm ci

COPY --chown=node:node . ./
RUN npm run build

FROM base AS production

RUN apt-get update
RUN apt-get install -y postgresql-client

ENV NODE_ENV=production

USER node
WORKDIR /home/node/app

COPY package.json package-lock.json entrypoint.sh ./
RUN npm ci

COPY --from=production_buildstage /home/node/app/dist /home/node/app/dist

RUN sed -i -e 's/\r$//' entrypoint.sh

CMD ["./entrypoint.sh"]

FROM base AS development

WORKDIR /home/node/app
