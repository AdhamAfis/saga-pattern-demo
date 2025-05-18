FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Set Docker environment variable
ENV DOCKER_ENV=true

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"] 