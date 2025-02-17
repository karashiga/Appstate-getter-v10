# Use a valid Node.js base image
FROM node:18  

# Update and install required dependencies
RUN apt-get update && apt-get install -y \
    libgbm1 \
    libasound2 \
    libnss3 \
    libatk1.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm-dev \
    libgtk-3-0 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libdrm2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside the container
WORKDIR /app  

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install  

# Copy all project files
COPY . .  

# Set the command to run the bot
CMD ["node", "index.js"]
