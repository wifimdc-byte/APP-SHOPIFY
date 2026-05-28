const pool = require('../connection');

const createCouponConfigTable = async () => {
  try {
    console.log('🔄 Criando tabela melhor_casas_coupon_config...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_coupon_config (
        id SERIAL PRIMARY KEY,
        fab_enabled BOOLEAN DEFAULT true,
        fab_icon_url VARCHAR(500),
        how_to_step1 TEXT DEFAULT 'Vá até a loja mais próxima',
        how_to_step2 TEXT DEFAULT 'Mostre essa tela para o caixa na hora da compra',
        how_to_step3 TEXT DEFAULT 'Ganhe 10% de desconto 🎉',
        coupon_title VARCHAR(100) DEFAULT 'CUPOM DIÁRIO',
        coupon_discount_text VARCHAR(50) DEFAULT '10% OFF',
        coupon_bottom_text VARCHAR(200) DEFAULT 'Mostre para o caixa',
        coupon_bottom_subtext VARCHAR(200) DEFAULT 'Válido apenas hoje',
        note_text VARCHAR(500) DEFAULT 'Limite de 1 uso por dia • Desconto máximo de R$ 20',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Inserir registro padrão se não existir
    const existing = await pool.query('SELECT id FROM melhor_casas_coupon_config LIMIT 1');
    if (existing.rows.length === 0) {
      await pool.query(`
        INSERT INTO melhor_casas_coupon_config (
          fab_enabled, 
          how_to_step1, 
          how_to_step2, 
          how_to_step3,
          coupon_title,
          coupon_discount_text,
          coupon_bottom_text,
          coupon_bottom_subtext,
          note_text
        ) VALUES (
          true,
          'Vá até a loja mais próxima',
          'Mostre essa tela para o caixa na hora da compra',
          'Ganhe 10% de desconto 🎉',
          'CUPOM DIÁRIO',
          '10% OFF',
          'Mostre para o caixa',
          'Válido apenas hoje',
          'Limite de 1 uso por dia • Desconto máximo de R$ 20'
        )
      `);
      console.log('✅ Registro padrão de configuração criado');
    }
    
    console.log('✅ Tabela melhor_casas_coupon_config criada com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao criar tabela melhor_casas_coupon_config:', error);
    throw error;
  }
};

if (require.main === module) {
  createCouponConfigTable()
    .then(() => {
      console.log('✅ Migration concluída!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro na migration:', error);
      process.exit(1);
    });
}

module.exports = createCouponConfigTable;
