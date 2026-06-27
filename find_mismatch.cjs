const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, 'server.ts'), 'utf8');
const lines = content.split('\n');

let depth = 0;
let stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Ignore comments and strings roughly
  let cleanLine = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Skip strings to avoid counting braces inside string literals
  cleanLine = cleanLine.replace(/`[\s\S]*?`/g, '""').replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""').replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''");

  for (let col = 0; col < cleanLine.length; col++) {
    const char = cleanLine[col];
    if (char === '{') {
      depth++;
      stack.push({ line: i + 1, text: line.trim() });
    } else if (char === '}') {
      depth--;
      if (stack.length > 0) {
        stack.pop();
      } else {
        console.log(`Extra closing brace '}' at line ${i + 1}: ${line.trim()}`);
      }
    }
  }
}

console.log('Final depth:', depth);
if (stack.length > 0) {
  console.log('Unclosed braces stack (showing top 15 deepest):');
  stack.slice(-15).forEach(item => {
    console.log(`Line ${item.line}: ${item.text}`);
  });
}
