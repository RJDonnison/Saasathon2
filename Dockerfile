FROM node:22-alpine

WORKDIR /app

# Install all three independent npm projects with the repository's existing setup script.
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
RUN npm run install-all

COPY . .

EXPOSE 4000 5173

CMD ["npm", "run", "dev"]
