FROM node:16-slim

WORKDIR /usr/src/app
COPY yarn.lock yarn.lock ./
COPY package.json package.json ./
COPY tsconfig.json tsconfig.json ./
COPY src/ ./src

RUN yarn && yarn build && rm -rf node_modules && yarn --production

ENV NODE_ENV="production"

CMD [ "yarn", "start" ]
