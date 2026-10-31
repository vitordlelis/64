# shortcut: estágio único (imagem inclui devDependencies); separar build/runtime se o tamanho da imagem incomodar.
FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter web build
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["sh", "-c", "node apps/api/src/migrate.ts && node apps/api/src/server.ts"]
