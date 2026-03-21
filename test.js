const fs = require('fs');
const content = fs.readFileSync('src/js/views/strategies.js', 'utf8');
const lines = content.split('\n');
for (let i = 305; i < 330; i++) {
    console.log(`${i+1}: ${lines[i]}`);
}
