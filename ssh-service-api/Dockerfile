FROM node:20-slim

WORKDIR /app

# Install OpenSSH client and git (needed for SSH operations and git clone)
RUN apt-get update && apt-get install -y openssh-client git && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 7000

USER node

CMD ["node", "server.js"]
