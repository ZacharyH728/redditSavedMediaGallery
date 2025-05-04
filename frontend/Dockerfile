# frontend/Dockerfile

# Stage 1: Build the React application
FROM node:18-alpine AS build

WORKDIR /usr/src/app/frontend

ARG REACT_APP_REDDIT_CLIENT_ID

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

ENV REACT_APP_REDDIT_CLIENT_ID=$REACT_APP_REDDIT_CLIENT_ID

# Build the React app for production
RUN npm run build

# Stage 2: Serve the built application using a lightweight server
FROM node:18-alpine

WORKDIR /usr/src/app/frontend

# Install `serve` to act as the static file server
RUN npm install -g serve

# Copy the build output from the build stage
COPY --from=build /usr/src/app/frontend/build ./build


# Expose port 3000
EXPOSE 3000

# Start the server
CMD ["serve", "-s", "build", "-l", "3000"]
