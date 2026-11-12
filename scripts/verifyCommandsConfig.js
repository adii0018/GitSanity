const pkg = require('../package.json');
const fs = require('fs');
const path = require('path');

const ext = fs.readFileSync(path.join(__dirname, '../src/extension.ts'), 'utf8');
const pkgCmds = pkg.contributes.commands.map(c => c.command);
const regMatches = [];
const regex = /registerCommand\(\s*['"]([^'"]+)['"]/g;
let m;
while ((m = regex.exec(ext)) !== null) {
  regMatches.push(m[1]);
}

console.log('--- COMMANDS VERIFICATION ---');
const inPkgNotReg = pkgCmds.filter(c => !regMatches.includes(c));
const inRegNotPkg = regMatches.filter(c => !pkgCmds.includes(c));
console.log('In package.json but not registered in extension.ts:', inPkgNotReg);
console.log('Registered in extension.ts but not in package.json:', inRegNotPkg);

console.log('\n--- CONFIG PROPERTIES VERIFICATION ---');
const declaredProps = Object.keys(pkg.contributes.configuration.properties).map(p => p.replace(/^gitsanity\./, ''));

// Scan src/**/*.ts for getConfiguration('gitsanity').get('...')
const srcFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts')) srcFiles.push(full);
  }
}
walk(path.join(__dirname, '../src'));

const configGets = new Set();
for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const getRegex = /\.get(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/g;
  let gm;
  while ((gm = getRegex.exec(content)) !== null) {
    if (content.includes(`getConfiguration('gitsanity')`)) {
      configGets.add(gm[1]);
    }
  }
}

console.log('Config keys read in code:', Array.from(configGets));
console.log('Config keys declared in package.json:', declaredProps);
const undeclared = Array.from(configGets).filter(k => !declaredProps.includes(k));
console.log('Read in code but undeclared in package.json:', undeclared);
