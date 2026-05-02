FROM node:20-slim AS build
WORKDIR /usr/src/app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /usr/src/app/lib ./lib
ENV NODE_ENV="production"
CMD [ "npm", "start" ]
