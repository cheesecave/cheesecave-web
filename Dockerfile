FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_GIT_COMMIT
ARG VITE_GIT_DIRTY=false
ENV VITE_GIT_COMMIT=$VITE_GIT_COMMIT VITE_GIT_DIRTY=$VITE_GIT_DIRTY
RUN pnpm build

FROM nginx:alpine
ENV BACKEND_URL=http://hub-api:48888 ADMIN_URL=http://hub-admin:80
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
COPY LICENSE LICENSING.md /usr/share/doc/cheesecave-web/
COPY provenance /usr/share/doc/cheesecave-web/provenance
COPY src/components/DatasetViewer/LICENSE /usr/share/doc/cheesecave-web/DatasetViewer.LICENSE
EXPOSE 80
