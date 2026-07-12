const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('schema.json')) {
      results.push(file);
    }
  });
  return results;
}

const schemas = walk(path.join(__dirname, '../src'));

console.log(`Found ${schemas.length} schema files. Validating...`);

let hasError = false;

schemas.forEach((file) => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    JSON.parse(content);
  } catch (e) {
    console.error(`❌ Invalid JSON in: ${file}`);
    console.error(`   Error: ${e.message}`);
    hasError = true;
  }
});

if (!hasError) {
  console.log('✅ All schema files are valid JSON.');
} else {
  process.exit(1);
}
