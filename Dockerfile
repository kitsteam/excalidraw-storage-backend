FROM node:16-alpine

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app

COPY package*.json ./

USER node
RUN npm ci

COPY --chown=node:node . ./
RUN npm run build

EXPOSE 8080

ENTRYPOINT ["npm", "run", "start:prod"]
