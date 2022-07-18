# Dockerfile for a simple react site
FROM node:lts-slim

WORKDIR /app

RUN npm install -g serve

COPY package.json .
COPY package-lock.json .

RUN npm install

COPY . .

RUN npm run build

HEALTHCHECK CMD curl --fail 0.0.0.0:80 || exit 1

CMD ["serve", "-l", "tcp://0.0.0.0:80", "-s", "build"]
