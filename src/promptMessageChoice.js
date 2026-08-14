const readline = require('readline');

function promptMessageChoice(templates) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\nChoose which message to send:\n');
    templates.forEach((template, index) => {
      console.log(`  ${index + 1}. ${template.label}`);
      if (template.description) {
        console.log(`     ${template.description}`);
      }
    });

    rl.question(`\nEnter number (1-${templates.length}): `, (answer) => {
      rl.close();

      const choice = Number.parseInt(String(answer).trim(), 10);
      const template = templates[choice - 1];

      if (!template) {
        console.error('Invalid choice.');
        process.exit(1);
      }

      resolve(template);
    });
  });
}

module.exports = { promptMessageChoice };
