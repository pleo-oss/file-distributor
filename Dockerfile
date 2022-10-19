FROM node:19-alpine AS BUILD_IMAGE

WORKDIR /usr/src/app

COPY yarn.lock package.json tsconfig.json .
COPY src/ ./src

RUN yarn && yarn build && rm -rf node_modules && yarn --production

###################

FROM node:19-alpine

WORKDIR /usr/src/app

COPY --from=BUILD_IMAGE /usr/src/app/package.json .
COPY --from=BUILD_IMAGE /usr/src/app/lib ./lib
COPY --from=BUILD_IMAGE /usr/src/app/node_modules ./node_modules

ENV NODE_ENV="production"
CMD [ "yarn", "start" ]
