# Use an official Node.js image as the base image
FROM node:18

# Set the working directory inside the container
WORKDIR /server

# Copy package.json and package-lock.json (or yarn.lock)
COPY package.json yarn.lock ./

# Install server dependencies
RUN yarn install

# Copy the rest of the server code
COPY . .

# Expose the server port (e.g., 3000)
EXPOSE 3006

# Start the server
CMD ["yarn", "start"]
