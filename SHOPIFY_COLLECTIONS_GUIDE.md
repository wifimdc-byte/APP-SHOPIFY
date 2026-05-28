# 📋 Guia para Criar Collections no Shopify

## 🎯 **Collections Necessárias para o App**

Para que o sistema funcione corretamente, você precisa criar as seguintes collections no seu Shopify:

### **Collections Obrigatórias:**
1. **Beleza - APP**
2. **Papelaria - APP** 
3. **Casa - APP**
4. **Brinquedos - APP**
5. **Tecnologia - APP**
6. **Pets - APP**

---

## 📝 **Como Criar Collections no Shopify:**

### **1. Acesse o Admin do Shopify:**
- Vá para: `https://e4ec7f-f5.myshopify.com/admin`
- Faça login com suas credenciais

### **2. Navegue para Collections:**
- No menu lateral, clique em **"Products"**
- Clique em **"Collections"**

### **3. Criar Nova Collection:**
- Clique em **"Create collection"**
- Preencha os campos:
  - **Title**: `Beleza - APP` (exemplo)
  - **Description**: Descrição da categoria
  - **Collection type**: `Manual` (recomendado para controle total)

### **4. Adicionar Produtos:**
- Após criar a collection, clique nela
- Clique em **"Add products"**
- Selecione os produtos que pertencem a essa categoria
- Clique em **"Save"**

### **5. Repetir para Todas as Collections:**
Crie as 6 collections seguindo o mesmo processo:

| Collection | Descrição | Exemplos de Produtos |
|------------|-----------|---------------------|
| **Beleza - APP** | Produtos de beleza e cuidados pessoais | Perfumes, cosméticos, produtos de higiene |
| **Papelaria - APP** | Material escolar e escritório | Cadernos, canetas, mochilas, livros |
| **Casa - APP** | Produtos para casa | Utilidades, utensílios, decoração, cama/mesa/banho |
| **Brinquedos - APP** | Brinquedos e jogos | Brinquedos infantis, jogos, bonecos |
| **Tecnologia - APP** | Eletrônicos e tecnologia | Celulares, fones, carregadores, eletrônicos |
| **Pets - APP** | Produtos para animais | Ração, brinquedos pet, coleiras |

---

## 🔧 **Sistema de Categorização:**

### **Collection "Casa - APP" (Especial):**
Esta collection pode conter subcategorias que serão mapeadas automaticamente:

- **Utilidades** - Produtos de limpeza, organização
- **Utensílios** - Panelas, talheres, pratos
- **Variedades** - Produtos diversos, vidros, cristais
- **CaMeBa** - Cama, mesa e banho
- **Eletro** - Eletrodomésticos
- **Led** - Iluminação LED

### **Mapeamento Automático:**
O sistema irá:
1. Buscar todas as collections com "- APP"
2. Usar o nome da collection como categoria
3. Para "Casa - APP", analisar o tipo de produto para subcategorizar

---

## 🚀 **Após Criar as Collections:**

### **1. Executar Sincronização:**
```bash
node clean-and-sync-app.js
```

### **2. Verificar Resultados:**
```bash
node check-categories.js
```

### **3. Testar no App:**
- Abrir o app mobile
- Verificar se as categorias aparecem corretamente
- Testar filtros por categoria

---

## 📊 **Estrutura Final Esperada:**

```
📱 App Mobile
├── Beleza (produtos da collection "Beleza - APP")
├── Papelaria (produtos da collection "Papelaria - APP")
├── Casa (produtos da collection "Casa - APP")
│   ├── Utilidades
│   ├── Utensílios
│   ├── Variedades
│   ├── CaMeBa
│   ├── Eletro
│   └── Led
├── Brinquedos (produtos da collection "Brinquedos - APP")
├── Tecnologia (produtos da collection "Tecnologia - APP")
└── Pets (produtos da collection "Pets - APP")
```

---

## ⚠️ **Importante:**

1. **Nome Exato**: Use exatamente "- APP" no final do nome
2. **Produtos Ativos**: Adicione apenas produtos ativos nas collections
3. **Organização**: Organize os produtos corretamente por categoria
4. **Teste**: Sempre teste após criar as collections

---

## 🔄 **Sincronização Automática:**

Após criar as collections, o sistema irá:
- ✅ Buscar apenas produtos das collections "- APP"
- ✅ Categorizar automaticamente baseado no nome da collection
- ✅ Aplicar preços exclusivos (15% desconto)
- ✅ Sincronizar em tempo real via webhooks

**Crie as collections no Shopify e execute a sincronização!** 🚀




