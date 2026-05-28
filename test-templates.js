const pool = require('./src/database/connection');

async function testTemplates() {
  try {
    console.log('🔍 Verificando templates no banco...\n');
    
    // Verificar se há templates
    const templatesResult = await pool.query('SELECT * FROM home_templates ORDER BY id');
    console.log(`📋 Templates encontrados: ${templatesResult.rows.length}`);
    templatesResult.rows.forEach((t, i) => {
      console.log(`  ${i + 1}. ID: ${t.id}, Nome: ${t.name}, Status: ${t.status}, Active Version ID: ${t.active_version_id}`);
    });
    
    // Verificar versões
    const versionsResult = await pool.query('SELECT * FROM home_template_versions ORDER BY template_id, version DESC');
    console.log(`\n📦 Versões encontradas: ${versionsResult.rows.length}`);
    versionsResult.rows.forEach((v, i) => {
      console.log(`  ${i + 1}. Template ID: ${v.template_id}, Versão: ${v.version}, Status: ${v.status}`);
    });
    
    // Verificar se há template publicado
    const publishedResult = await pool.query("SELECT id FROM home_templates WHERE status = 'published' LIMIT 1");
    console.log(`\n✅ Templates publicados: ${publishedResult.rows.length}`);
    
    if (publishedResult.rows.length === 0 && templatesResult.rows.length === 0) {
      console.log('\n⚠️  Nenhum template encontrado! O ensureDefaultTemplate deveria criar um automaticamente.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

testTemplates();

















