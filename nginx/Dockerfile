# Build context is the repo root so this can reach both frontend/ and nginx/.
FROM node:20-slim AS build

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/conf.d/ /etc/nginx/conf.d/
