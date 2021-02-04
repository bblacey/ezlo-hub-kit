# Contributing to Ezlo-Hub-Kit

## TBD ##

### Set up local development and test environment

Create a [fork](https://docs.github.com/en/github/getting-started-with-github/fork-a-repo) of the original [Ezlo-Hub-Kit repo](bblacey/ezlo-hub-kit) and clone it to your computer using GitHub's instructions.

### Confirm that you can build & test Ezlo-Hub-Kit locally

Verify that you are able to build and run the tests locally to ensure you are starting with a solid source code baseline.

#### Build (npm run build)
```shell
╭─blacey@bbl ~/Projects/ezlo/ezlo-hub-kit ‹develop*›
╰─$ npm run build

> ezlo-hub-kit@1.0.0-alpha.6 build
> rimraf ./lib && tsc -p tsconfig.json && tsc -p tsconfig-esm.json
```
#### Verify that tests pass locally (npm run test)
The test cases will run against your local hubs and are non-destructive in nature.  In order for the test cases to run, they will need to retrieve your local hubs' credentials from the MIOS cloud.  Edit the [test/miosTestUser.json](test/miosTestUser.json) file and update it to use your MIOS username and password for local testing.

WARNING: BE SURE YOU DO NOT CHECK THE miosTestUser.json FILE BACK INTO GIT OTHERWISE YOU WILL SHARE YOUR CREDENTIALS PUBLICLY!  Double-check your commits with `git status` and even `git diff --cached` before invoking `git commit` to ensure you haven't inadvertently added it for commit.

```shell
╭─blacey@bbl ~/Projects/ezlo/ezlo-hub-kit ‹develop*›
╰─$ npm run test

> ezlo-hub-kit@1.0.0-alpha.6 test
> mocha -r ts-node/register test/**/*.test.ts

  EzloCredentials Test Suite
    FileResolver Tests
      ✓ hubs(): registered hubs
      ✓ credentials(): credentials from FileResolver for known hubs
      ✓ credentials(): throw for missing credentials file - invalid path
      ✓ credentials(): throw for missing or invalid hub entry
    EzloCloudResolver Tests
      ✓ hubs(): registered hubs (1425ms)
      ✓ hubs(): throw for non-existant MIOS user (274ms)
      ✓ credentials(): credentials from Cloud for known hubs
      ✓ credentials(): throw for missing or invalid hub entry

  EzloHub Test Suite
    Setup - identify locally testable hubs
      ✓ Registered hubs: 45006642,70060017,70060095,76002425,90000330,90000369,92000014
      ✖ Hub 45006642 is offline
      ✓ Hub 70060017 is available for test execution
      ✓ Hub 70060095 is available for test execution
      ✓ Hub 76002425 is available for test execution
      ✓ Hub 90000330 is available for test execution
      ✓ Hub 90000369 is available for test execution
      ✓ Hub 92000014 is available for test execution
      ✓ Hub 90000369 selected for test execution
    Hub Discovery
      ✓ Discovered hubs: 70060017,70060095,76002425,90000330,90000369,92000014
      ✓ discoverEzloHubs() (663ms)
    Secure Login (for each locally available ezlo hub)
      ✓ Securely connected to local hub 90000369, model: h2.1, architecture: armv7l, firmware: 2.0.7.1313.16
      ✓ Securely connected to local hub 90000330, model: h2.1, architecture: armv7l, firmware: 2.0.7.1313.16
      ✓ Securely connected to local hub 92000014, model: h2_secure.1, architecture: armv7l, firmware: 2.0.7.1313.16
      ✓ Securely connected to local hub 76002425, model: ATOM32, architecture: esp32, firmware: 0.8.514
      ✓ Securely connected to local hub 70060017, model: ATOM32, architecture: esp32, firmware: 0.8.528
      ✓ Securely connected to local hub 70060095, model: ATOM32, architecture: esp32, firmware: 0.8.528
      ✓ Connect to each available hub (1888ms)
    Hub Properties
      ✓ info(): hub.info.get
      ✓ data(): hub.data.list (72ms)
      ✓ devices(): hub.devices.list
      ✓ device(): device with name
      ✓ items(): hub.items.list (55ms)
      ✓ items(): hub.items.list (for specific device)
      ✓ items(): hub.items.list (for non-existant device)
      ✓ item(): item with name for device (58ms)
      ✓ scenes(): hub.scenes.list
      ✓ scene(): scene with name (58ms)
      ✓ scene(): scene with name - non-existant
      ✓ rooms(): hub.room.list
      ✓ room(): room with name
      ✓ houseModes(): hub.modes.get
      ✓ houseMode(): house mode with name
      ✓ houseMode(): invalid mode name (type)
      ✓ currentHouseMode(): valid mode id
      ✓ currentHouseMode(): valid mode name
    Hub Event Observations
      ✓ addObserver(): hub.offline.login.ui
    Hub Actions
      ✓ setHouseMode(): hub.modes.switch to current mode (43ms)
      ✓ setHouseMode(): hub.modes.switch to new mode (56ms)
      ✓ setHouseMode(): hub.modes.switch to invalid mode
        ➔ running scene "Test:6016dd71129ded167eded4b5"
      ✓ runScene() (56ms)
      - setItemValue()
    Keep-alive test
      - connection-interrupt test


  33 passing (11s)
  2 pending
```

### Test Utilities
There are two test utilities available in [](test/utils). [createHubCredentialsFile.js](test/utils/createHubCredentials.js) can be used to create a file of hub authorization credentials.  While this is useful for testing, users who use other tools that require the hub user and auth tokens will find this convenient.  [hubMonitor.js](test/utils/hubMonitor.js) can be used to monitor the `ui_broadcast` messages sent from all hub discovered on the local area network.  Both utilities offer help with `--help` command-line option.  They also serve as additional examples of using the `ezlo-hub-kit` SDK.

### Bug fixes - run regression tests locally

### Enhancements - add test case(s)

### Check lint results locally

### Run regression tests locally

### Submit a Pull Request

### Continuous Integration

#### Quality Checks

#### Live Hub Testing

## Debugging with Visual Studio Code