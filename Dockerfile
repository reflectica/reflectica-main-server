# Use the official Node.js 18 Alpine image for smaller size
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Cloud Run expects your app to listen on the PORT environment variable
ENV PORT=8080

# Expose the port
EXPOSE 8080

# Start the server using node (not nodemon for production)
CMD ["npm", "start"]