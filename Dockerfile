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

CMD ["node", "index.js"]