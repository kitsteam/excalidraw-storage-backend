FROM node:20-bullseye-slim as base

FROM base as production_buildstage

WORKDIR /home/node/app
COPY package.json package-lock.json ./

RUN npm ci

COPY --chown=node:node . ./
RUN npm run build

FROM base as production

ENV NODE_ENV=production

USER node
WORKDIR /home/node/app

COPY package.json package-lock.json ./
RUN npm ci

COPY --from=production_buildstage /home/node/app/dist /home/node/app/dist

USER node

ENTRYPOINT ["npm", "run", "start:prod"]

FROM base as development

WORKDIR /home/node/app
