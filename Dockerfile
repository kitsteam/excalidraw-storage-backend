FROM node:18-bullseye-slim

RUN apt-get update && apt-get install -y make g++ python3
RUN ln -sf /usr/bin/python3 /usr/bin/python

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app

COPY package*.json ./

USER node
RUN npm ci

COPY --chown=node:node . ./
RUN npm run build

EXPOSE 8080

ENTRYPOINT ["npm", "run", "start:prod"]
