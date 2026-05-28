const axios = require('axios');
const shopifyService = require('./src/services/shopifyService');
const db = require('./src/database/connection');

/**
 * Converte produto do formato GraphQL (bulk operation) para formato REST
 * que o mapProductToApp espera
 */
function convertGraphQLToREST(graphQLProduct) {
  // Extrair ID numérico do GID
  const extractId = (gid) => {
    if (!gid) return null;
    if (typeof gid === 'string' && gid.startsWith('gid://')) {
      return gid.split('/').pop();
    }
    return gid.toString();
  };

  const productId = extractId(graphQLProduct.id);
  
  // Converter variantes
  const variants = graphQLProduct.variants?.edges?.map(edge => {
    const variant = edge.node;
    return {
      id: extractId(variant.id),
      title: variant.title || 'Default Title',
      price: variant.price || '0.00',
      compare_at_price: variant.compareAtPrice || null,
      inventory_quantity: variant.inventoryQuantity || 0,
      inventory_policy: variant.inventoryPolicy || 'deny',
      available: variant.availableForSale !== false,
      sku: variant.sku || ''
    };
  }) || [];

  // Converter imagens
  const images = graphQLProduct.images?.edges?.map(edge => {
    const image = edge.node;
    return {
      id: extractId(image.id),
      src: image.url || '',
      alt: image.altText || ''
    };
  }) || [];

  // Converter tags (array para string)
  const tags = Array.isArray(graphQLProduct.tags) 
    ? graphQLProduct.tags.join(', ')
    : (graphQLProduct.tags || '');

  // Converter status
  const status = graphQLProduct.status?.toLowerCase() || 'active';

  return {
    id: productId,
    title: graphQLProduct.title || '',
    handle: graphQLProduct.handle || '',
    body_html: graphQLProduct.description || '',
    vendor: graphQLProduct.vendor || '',
    product_type: graphQLProduct.productType || '',
    tags: tags,
    status: status,
    variants: variants,
    images: images,
    created_at: graphQLProduct.createdAt || new Date().toISOString(),
    updated_at: graphQLProduct.updatedAt || new Date().toISOString()
  };
}

/**
 * Processa e sincroniza produtos do bulk operation
 */
async function processBulkResults(url) {
  try {
    console.log('📥 Baixando resultados do bulk operation...');
    
    // Baixar arquivo JSONL
    const response = await axios.get(url, {
      responseType: 'text',
    });

    // Processar JSONL (cada linha é um JSON)
    const lines = response.data.trim().split('\n');
    console.log(`📦 ${lines.length} linhas encontradas no arquivo`);

    const products = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        const line = lines[i].trim();
        if (!line) continue;
        
        const graphQLProduct = JSON.parse(line);
        const restProduct = convertGraphQLToREST(graphQLProduct);
        
        // Validar produto
        if (!restProduct.id || !restProduct.variants || restProduct.variants.length === 0) {
          console.log(`⚠️ Linha ${i + 1}: Produto sem ID ou variantes, pulando...`);
          continue;
        }

        products.push(restProduct);
      } catch (parseError) {
        console.error(`❌ Erro ao processar linha ${i + 1}:`, parseError.message);
        continue;
      }
    }

    console.log(`✅ ${products.length} produtos válidos processados\n`);

    // Processar em lotes
    const batchSize = 100;
    let syncedCount = 0;
    let updatedCount = 0;
    let insertedCount = 0;
    let errorCount = 0;

    console.log(`🔄 Sincronizando ${products.length} produtos em lotes de ${batchSize}...\n`);

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(products.length / batchSize);
      const progress = ((i + batch.length) / products.length * 100).toFixed(1);

      console.log(`📦 [${progress}%] Processando lote ${batchNum}/${totalBatches} (${batch.length} produtos)...`);

      // Buscar códigos existentes
      const codigos = batch.map(p => p.id.toString());
      const existingResult = await db.query(
        'SELECT codigo FROM melhor_casas_products WHERE codigo = ANY($1)',
        [codigos]
      );
      const existingCodigos = new Set(existingResult.rows.map(r => r.codigo));

      const toInsert = [];
      const toUpdate = [];

      // Mapear produtos
      for (const shopifyProduct of batch) {
        try {
          const mappedProduct = shopifyService.mapProductToApp(shopifyProduct);
          
          if (!mappedProduct) {
            continue;
          }

          if (existingCodigos.has(mappedProduct.codigo)) {
            toUpdate.push(mappedProduct);
          } else {
            toInsert.push(mappedProduct);
          }
        } catch (mapError) {
          console.error(`❌ Erro ao mapear produto ${shopifyProduct.id}:`, mapError.message);
          errorCount++;
        }
      }

      // Inserir novos produtos
      if (toInsert.length > 0) {
        const insertBatchSize = 20;
        for (let j = 0; j < toInsert.length; j += insertBatchSize) {
          const insertBatch = toInsert.slice(j, j + insertBatchSize);
          const values = insertBatch.map((p, idx) => {
            const baseIdx = idx * 14;
            return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12}, $${baseIdx + 13}, $${baseIdx + 14})`;
          }).join(', ');

          const params = insertBatch.flatMap(p => [
            p.codigo,
            p.nome,
            p.categoria,
            p.preco_varejo,
            p.preco_atacado,
            p.preco_exclusivo,
            p.descricao,
            p.imagem_url,
            JSON.stringify(p.imagens || []),
            p.estoque,
            p.disponivel,
            JSON.stringify(p.tags || []),
            p.created_at,
            p.updated_at
          ]);

          try {
            await db.query(`
              INSERT INTO melhor_casas_products 
              (codigo, nome, categoria, preco_varejo, preco_atacado, 
               preco_exclusivo, descricao, imagem_url, imagens, estoque, 
               disponivel, tags, created_at, updated_at)
              VALUES ${values}
              ON CONFLICT (codigo) DO NOTHING
            `, params);

            insertedCount += insertBatch.length;
          } catch (insertError) {
            console.error(`❌ Erro ao inserir lote:`, insertError.message);
            errorCount += insertBatch.length;
          }
        }
      }

      // Atualizar produtos existentes
      if (toUpdate.length > 0) {
        for (const product of toUpdate) {
          try {
            await db.query(`
              UPDATE melhor_casas_products SET
                nome = $1,
                categoria = $2,
                preco_varejo = $3,
                preco_atacado = $4,
                preco_exclusivo = $5,
                descricao = $6,
                imagem_url = $7,
                imagens = $8,
                estoque = $9,
                disponivel = $10,
                tags = $11,
                updated_at = $12
              WHERE codigo = $13
            `, [
              product.nome,
              product.categoria,
              product.preco_varejo,
              product.preco_atacado,
              product.preco_exclusivo,
              product.descricao,
              product.imagem_url,
              JSON.stringify(product.imagens || []),
              product.estoque,
              product.disponivel,
              JSON.stringify(product.tags || []),
              product.updated_at,
              product.codigo
            ]);

            updatedCount++;
          } catch (updateError) {
            console.error(`❌ Erro ao atualizar produto ${product.codigo}:`, updateError.message);
            errorCount++;
          }
        }
      }

      syncedCount += batch.length;
      console.log(`✅ Lote ${batchNum}: ${insertedCount} inseridos, ${updatedCount} atualizados até agora\n`);
    }

    console.log('\n✅ Sincronização concluída!');
    console.log(`📊 Estatísticas:`);
    console.log(`   - Total processado: ${syncedCount}`);
    console.log(`   - Novos produtos: ${insertedCount}`);
    console.log(`   - Produtos atualizados: ${updatedCount}`);
    console.log(`   - Erros: ${errorCount}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro ao processar resultados:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Executar
const url = process.argv[2];

if (!url) {
  console.error('❌ Uso: node process-bulk-results.js <url_do_arquivo_jsonl>');
  console.error('   Exemplo: node process-bulk-results.js https://storage.googleapis.com/...');
  process.exit(1);
}

processBulkResults(url);
