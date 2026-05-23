const fs = require('fs');
const mainTsContent = fs.readFileSync('main.ts', 'utf8');
const pluginCodePath = 'src/data/pluginCode.ts';
let pluginCodeContent = fs.readFileSync(pluginCodePath, 'utf8');

const mainTsStart = pluginCodeContent.indexOf('export const MAIN_TS = `');
if (mainTsStart !== -1) {
  const mainTsEnd = pluginCodeContent.indexOf('\n`;\n', mainTsStart);
  if (mainTsEnd !== -1) {
    const newMainTsStr = 'export const MAIN_TS = `' + mainTsContent.replace(/\\/g, '\\\\').replace(/\`/g, '\\`').replace(/\$/g, '\\$') + '`;\n';
    pluginCodeContent = pluginCodeContent.substring(0, mainTsStart) + newMainTsStr + pluginCodeContent.substring(mainTsEnd + 4);
    fs.writeFileSync(pluginCodePath, pluginCodeContent);
    console.log('Successfully updated MAIN_TS in pluginCode.ts');
  }
}
