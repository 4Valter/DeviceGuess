FROM node:18-alpine

WORKDIR /app

# On copie les fichiers de configuration
COPY package*.json ./

# On remplace "npm ci" par "npm install" qui est plus flexible
# On utilise --omit=dev pour ne pas installer les outils inutiles en production
RUN npm install --omit=dev

# Copie du reste des fichiers
COPY . .

# Création du dossier de données
RUN mkdir -p /data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

# Route de santé simplifiée pour éviter les échecs de déploiement
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "index.js"]