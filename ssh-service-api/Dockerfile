FROM node:20-slim

WORKDIR /app

# Install OpenSSH client (needed for some SSH operations)
RUN apt-get update && apt-get install -y openssh-client && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 7000

USER node

CMD ["node", "server.js"]
