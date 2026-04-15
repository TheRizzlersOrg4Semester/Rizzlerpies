const http = require('http');
const https = require('https');

const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/healthcheck.js <url>');
  process.exit(1);
}

const client = target.startsWith('https://') ? https : http;
const request = client.get(target, (response) => {
  response.resume();

  if (response.statusCode >= 200 && response.statusCode < 300) {
    process.exit(0);
    return;
  }

  console.error(`Healthcheck failed with status ${response.statusCode}`);
  process.exit(1);
});

request.setTimeout(5000, () => {
  console.error('Healthcheck timed out');
  request.destroy();
  process.exit(1);
});

request.on('error', (error) => {
  console.error(`Healthcheck failed: ${error.message}`);
  process.exit(1);
});
