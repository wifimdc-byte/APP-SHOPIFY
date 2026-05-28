FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código da aplicação
COPY . .

# Criar diretório para uploads
RUN mkdir -p uploads/reviews uploads/banners

# Expor porta
EXPOSE 3001

# Comando para iniciar
CMD ["npm", "start"]














