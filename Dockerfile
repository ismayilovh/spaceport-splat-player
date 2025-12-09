FROM node:18-alpine

WORKDIR /app

# Bağımlılıkları yükle
COPY package*.json ./
RUN npm install

# Tüm proje dosyalarını kopyala
COPY . .

# Uygulama 8081 portunda çalışıyor
EXPOSE 8081

# Splat Viewer dev server başlat
CMD ["npm", "run", "dev:all"]

