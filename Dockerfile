# Use an official Node.js runtime as a parent image
FROM node:18-bullseye

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json before running npm install
COPY package*.json ./

# Install dependencies
RUN npm install

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    libatk-bridge2.0-0 \
    libnss3 \
    libxss1 \
    libasound2 \
    libgtk-3-0 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy the rest of the application
COPY . .

# Expose the port the app runs on
EXPOSE 7568

# Set environment variables
ENV PORT=7568
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Start the application
CMD ["node", "index.js"]
