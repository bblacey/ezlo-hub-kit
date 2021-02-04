#!/usr/bin/env node

'use strict';

const { EzloCloudResolver, discoverEzloHubs, UIBroadcastPredicate } = require('../../lib/cjs/index.js');
const { program } = require('commander');
const read = require('read');

const hubs = {};

async function main() {

  // Command line arguments
  program
    .requiredOption('-u, --username <string>', 'MIOS Portal user id (required)')
    .option('-p, --password <string>', 'MIOS Portal password (optional)');
  program.parse(process.argv);

  const options = program.opts();
  const username = options.username;
  let password = options.password;

  // Prompt for the password if one wasn't passed on the command line
  if (!options.password) {
    password = await new Promise((resolve) => {
      read({prompt: 'Password: ', silent: true}, (err, passwd) => resolve(passwd));
    });
  }

  // Register ui_broadcast logger for each local hub (discover, register, log)
  discoverEzloHubs(new EzloCloudResolver(username, password), async (hub) => {

    // Report the information about the discovered hub
    const info = await hub.info();
    console.log('Observing: %s, architecture: %s\t, model: %s\t, firmware: %s, uptime: %s',
      info.serial, info.architecture, info.model, info.firmware, info.uptime);

    // Write any ui_broadcast messages for this hub to console
    hub.addObserver( UIBroadcastPredicate, (msg) => {
      console.log('%s %s:ui_broadcast %o\n', (new Date().toUTCString()), hub.identity, msg);
    });

    // Track hubs for clean shutdown on exit
    hubs[hub.identity] = hub;
  });
}

// Register handler to disconnect from hubs on ctrl-C
process.on('SIGINT', function() {
  console.log('Disconnecting from ezlo hubs');
  Promise.all(Object.values(hubs).map(hub => hub.disconnect()))
    .then(() => {
      process.exit();
    });
});

// Main entry
main().catch((err) => console.log('Unexpected error - %O', err));
