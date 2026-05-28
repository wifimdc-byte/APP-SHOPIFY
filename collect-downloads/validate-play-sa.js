const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node validate-play-sa.js /path/to/service-account.json');
}

async function main() {
  const fp = process.argv[2] || path.join(__dirname, 'app-downloads-485712-af07a2852d9d.json');
  if (!fs.existsSync(fp)) {
    console.error('File not found:', fp);
    usage();
    process.exit(2);
  }
  const raw = fs.readFileSync(fp, 'utf8');
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    console.error('Invalid JSON:', err.message);
    process.exit(3);
  }

  const needed = ['type','project_id','client_email','private_key'];
  const missing = needed.filter(k => !obj[k]);
  console.log('Service Account summary:');
  console.log('  project_id :', obj.project_id || '(missing)');
  console.log('  client_email:', obj.client_email || '(missing)');
  console.log('  client_id   :', obj.client_id || '(missing)');
  console.log('  private_key_id:', obj.private_key_id || '(missing)');
  if (missing.length) {
    console.warn('\nWARNING: missing fields ->', missing.join(', '));
  } else {
    console.log('\nAll required fields are present.');
  }

  console.log('\nNext steps:');
  console.log(' - In Play Console -> Setup -> API access, link the Google Cloud project (if not linked)');
  console.log(` - Grant access to the service account email: ${obj.client_email}`);
  console.log(' - Download the JSON (if not already) and run the PowerShell script set-play-env.ps1 to export the env var for testing.');
}

main().catch(e => { console.error(e); process.exit(1); });
