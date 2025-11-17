# backend/Dockerfile

# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app/backend

# Copy package.json and package-lock.json (if available)
# Use wildcard to copy both if they exist
COPY package*.json ./

# Install backend dependencies
RUN npm install

# Copy the backend server code
COPY server.js .

# Make port 4000 available to the world outside this container
EXPOSE 4000

ARG REDDIT_CLIENT_ID
ENV REDDIT_CLIENT_ID=$REDDIT_CLIENT_ID
ARG REDDIT_CLIENT_SECRET
ENV REDDIT_CLIENT_SECRET=$REDDIT_CLIENT_SECRET
ARG PORT
ENV PORT=$PORT
ARG API_URL
ENV API_URL=$API_URL

# Define the command to run your app
CMD [ "node", "server.js" ]