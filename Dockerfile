FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

ENV PORT=8788
ENV DATA_DIR=/var/lib/nexus-work
EXPOSE 8788

CMD ["npm", "start"]
