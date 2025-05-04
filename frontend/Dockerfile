# frontend/Dockerfile

# Stage 1: Build the React application
FROM node:18-alpine AS build

WORKDIR /usr/src/app/frontend

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the React app for production
RUN npm run build

# Stage 2: Serve the built application using a lightweight server
FROM node:18-alpine

WORKDIR /usr/src/app/frontend

# Install `serve` to act as the static file server
RUN npm install -g serve

# Copy the build output from the build stage
COPY --from=build /usr/src/app/frontend/build ./build

COPY generateConfig.js .

# Expose port 3000
EXPOSE 3000

# Start the server
# ENTRYPOINT ["sh", "-c"]
# CMD ["node generateConfig.js && serve -s build -l 3000"]
CMD node generateConfig.js && serve -s build -l 3000
