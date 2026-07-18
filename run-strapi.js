const path = require('path');
const { fork } = require('child_process');

// 1. Find the path to Strapi's package.json safely
const pkgJsonPath = require.resolve('@strapi/strapi/package.json');
const strapiDir = path.dirname(pkgJsonPath);

// 2. Read where Strapi points its CLI execution binary (bin/strapi.js)
const pkgJson = require(pkgJsonPath);
const binPath = typeof pkgJson.bin === 'string' ? pkgJson.bin : pkgJson.bin.strapi;

// 3. Assemble the true, un-guessable file destination
const cliPath = path.join(strapiDir, binPath);

// 4. Capture any arguments passed to the script
const args = process.argv.slice(2);

// 5. Execute it flawlessly across environments
fork(cliPath, args, { stdio: 'inherit' });
