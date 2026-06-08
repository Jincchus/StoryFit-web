FROM node:20-alpine AS base
RUN apk add --no-cache openssl

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json ./
RUN npm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN node -e "require('fs').writeFileSync('.env','')" && npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# WHIF는 클라이언트 렌더링 SPA라 헤드리스 브라우저로 렌더링해야 캐릭터 정보를 읽을 수 있음.
# Playwright/Puppeteer가 받는 번들 Chromium은 glibc 기반이라 musl 기반 Alpine에서 동작하지 않으므로
# apk의 musl 호환 Chromium을 설치하고 puppeteer-core가 그 바이너리를 쓰도록 경로를 지정한다.
RUN apk add --no-cache chromium
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir -p ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

COPY --chown=nextjs:nodejs start.sh ./start.sh
RUN mkdir -p /app/uploads/avatars && chown -R nextjs:nodejs /app/uploads
RUN mkdir -p /app/browser-profiles/melting && chown -R nextjs:nodejs /app/browser-profiles
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "start.sh"]
