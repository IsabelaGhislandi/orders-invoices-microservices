FROM node:current-alpine AS base

# ---------

FROM base AS deps

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

# --------- DOCKER EM LAYERS. CADA FROM É UMA IMAGEM. DENTRO DE CADA LAYER VIVE SO ALI DENTRO DA LAYER. 
# --------  PQ ISSO É BOM? POR CAUSA DAS DEPENDENCIA Q DEPENDEM EXCLUSIVAMEBNTE DO PACKGE JSON, SE APLICAÇÃO SO MUDAR OU REMOVER UMA DEPENDENCIA, A IMAGEM NÃO VAI SER RECONSTRUÍDA.

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 api

RUN chown api:nodejs .

COPY --chown=api:nodejs . .
COPY --from=deps /app/node_modules ./node_modules

USER api

EXPOSE 3333

ENV PORT=3333
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["npm", "run", "start"]