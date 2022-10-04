FROM node:18-slim

WORKDIR /usr/src/app
COPY yarn.lock yarn.lock ./
COPY package.json package.json ./
COPY tsconfig.json tsconfig.json ./
COPY src/ ./src

RUN yarn
RUN yarn build

ENV NODE_ENV="production"

CMD [ "yarn", "start" ]
