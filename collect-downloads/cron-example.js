const cron = require('node-cron');
const { runAll } = require('./run-all');

// Example schedule: daily at 00:30
cron.schedule('30 0 * * *', async () => {
  console.log('Starting daily collect job', new Date().toISOString());
  try {
    await runAll();
    console.log('Collect job finished');
  } catch (err) {
    console.error('Collect job error', err);
  }
});

console.log('Cron example started.');
