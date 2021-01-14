#!/usr/bin/env node
const ezlo = require('../../lib/cjs/EzloCredentials');
const program = require('commander');
const read = require('read');
const fs = require('fs');

// Parse the command line arguments
program
  .requiredOption('-u, --username <string>', 'MIOS Portal user id (required)')
  .option('-p, --password <string>', 'MIOS Portal password (optional)')
  .requiredOption('-o, --output <path>', 'hub credentials output file (required)');

async function main() {
  program.parse(process.argv);
  const username = program.username;
  let password = program.password;
  const credentialsFile = program.output;

  // Prompt for the password if one wasn't passed on the command line
  if (!program.password) {
    password = await new Promise((resolve) => {
      read({prompt: 'Password: ', silent: true}, (err, passwd) => resolve(passwd));
    });
  }

  // Create a credentials dictonary from hubs known to the credentials resolver
  const credentialsResolver = new ezlo.EzloCloudResolver(username, password);
  const credentials = {};
  try {
    for (const hub of await credentialsResolver.hubs()) {
      credentials[hub] = await credentialsResolver.credentials(hub);
    }
  } catch(e) {
    console.log('Failed to retrieve credentials due to error %O', e);
  }

  fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2));
}

// Register handler to disconnect from hubs and mqtt on ctrl-C
process.on('SIGINT', function() {
  process.exit();
});

try {
  main();
} catch (err) {
  console.log('Unexpected error occurred - %O', err);
}
