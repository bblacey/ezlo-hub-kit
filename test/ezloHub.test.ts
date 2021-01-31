/* eslint-disable no-console */
import { EzloHub, HubIdentifier, ObservationHandler, MessagePredicate, discoverEzloHubs, EzloIdentifier } from '../src/EzloHub';
import { EzloCloudResolver } from '../src/EzloCredentials';
import * as MDNSResolver from 'mdns-resolver';

import * as chai from 'chai';
import { expect } from 'chai';
chai.use(require('chai-as-promised'));

import chalk = require('chalk');

///////
// Change the test user credentials to your MIOS portal user in order run these tests
//
// To execute these tests, create a file test/miosTestUser.json with the following json
// that includes your MIOS portal username and password (required to authenticate with hubs)
// {
//   "username" : "portal user",
//   "password" : "portal password"
// }
import miosUser from './miosTestUser.json';

const resolverStrategy: EzloCloudResolver = new EzloCloudResolver(miosUser.username, miosUser.password);
let registeredHubs: HubIdentifier[];
let availableHubs: HubIdentifier[];
let hubSerial: HubIdentifier = 'undefined';

// Test conveneince extension to randomly select an element from an Array
declare global {
  interface Array<T> {
    randomElem(): T;
  }
}
Array.prototype.randomElem = function () {
  return this[Math.floor( Math.random() * this.length )];
};

describe('EzloHub Test Suite', function() {

  before('Identify available test hub(s)', async function() {

    async function onlineHubs(hubs: string[]): Promise<HubIdentifier[]> {
      const onlineHubs: HubIdentifier[] = [];
      for (const hubSerial of hubs) {
        try {
          await MDNSResolver.resolve4(`HUB${hubSerial}.local`);
          onlineHubs.push(hubSerial);
          console.log('     ', chalk.green.bold('✓'), chalk.gray(`Hub ${hubSerial} is available for test execution`));
        } catch (e) {
          console.log('     ', chalk.red('✖'), chalk.grey(`Hub ${hubSerial} is`), chalk.red('offline'));
        }
      }
      return onlineHubs;
    }

    this.timeout(30000);  // Allow ample time to retrieve the registered hubs from the MIOS/Ezlo cloud and check online status
    console.log('    Setup - identify locally testable hubs');

    registeredHubs = await resolverStrategy.hubs();
    console.log(chalk.green('      ✓'), chalk.gray(`Registered hubs: ${registeredHubs}`));

    availableHubs = await onlineHubs(registeredHubs);

    hubSerial = availableHubs.randomElem();
    console.log(chalk.green('      ✓'), chalk.gray(`Hub ${hubSerial} selected for test execution`));
  });

  describe('Hub Discovery', function() {
    it('discoverEzloHubs()', function(done) {
      // Attempt to discover all "available" hubs in 5 seconds or less
      const discoveryPeriod = 5000;
      this.timeout(discoveryPeriod+250);

      const discoveredHubs: EzloHub[] = [];

      discoverEzloHubs(resolverStrategy, (hub) => {
        expect(hub).be.instanceOf(EzloHub);
        discoveredHubs.push(hub);
        if (discoveredHubs.length >= availableHubs.length) {
          expect(discoveredHubs.map(h => h.identity)).to.have.members(availableHubs);
          console.log(chalk.green('      ✓'), chalk.gray(`Discovered hubs: ${discoveredHubs.sort()}`));
          done();
        }
      }, discoveryPeriod);
    });
  });

  describe('Secure Login (for each locally available ezlo hub)', function() {
    it('Connect to each available hub', function() {
      this.timeout(availableHubs.length * 5000);
      const hubs: Promise<EzloIdentifier>[] = availableHubs.map(serial => {
        return new Promise((resolve, reject) => {
          EzloHub.createHub(serial, resolverStrategy)
            .then((hub) => {
              hub.info().then((info) => {
                console.log(chalk.green('      ✓'), chalk.gray(`Securely connected to local hub ${serial}, model: ${info.model}, `
                + `architecture: ${info.architecture}, firmware: ${info.firmware}`));
                expect(info, 'Info should contain serial property').to.have.property('serial');
                hub.disconnect().then(() => resolve('successful connection'));
              });
            })
            .catch((err) => reject(err));
        });
      });
      return expect(Promise.all(hubs)).to.eventually.be.fulfilled;
    });
  });

  describe('Hub Properties', function() {
    before('initialize hub test instance', async function() {
      this.hub = await EzloHub.createHub(hubSerial, resolverStrategy).then(hub => hub.connect());
    });
    after(function () {
      this.hub.disconnect();
    });

    it('info(): hub.info.get', function() {
      return this.hub.info()
        .then((info) => {
          expect(info, 'Info should contain serial property').to.have.property('serial');
          expect(info, 'Info should contain firmware property').to.have.property('firmware');
          expect(info, 'Info should contain architecture property').to.have.property('architecture');
        });
    }).timeout(5000);

    it('data(): hub.data.list', function() {
      return this.hub.data()
        .then((data) => {
          expect(data, 'hub.data should contain "devices" entry').to.have.property('devices');
          expect(data, 'hub.data should contain "items" entry').to.have.property('items');
          expect(data, 'hub.data should contain "rooms" entry').to.have.property('rooms');
          expect(data, 'hub.data should contain "scenes" entry').to.have.property('scenes');
        });
    }).timeout(5000); //hub.data.list can be slow

    it('devices(): hub.devices.list', function() {
      return expect(this.hub.devices()).to.eventually.be.fulfilled.and.have.property('length').greaterThan(0);
    }).timeout(4000);

    it('device(): device with name', function() {
      return this.hub.devices()
        .then((devices) => {
          expect(devices.length, 'No devices returned').to.be.greaterThan(0);
          const randomDevice = devices.randomElem();
          return { name: randomDevice.name, id: randomDevice._id };
        })
        .then((testDevice) => {
          this.hub.scene(testDevice.name)
            .then((scn) => {
              return expect(scn._id).to.be.equal(testDevice.id);
            });
        });
    }).timeout(4000);

    it('items(): hub.items.list', function() {
      return expect(this.hub.items()).to.eventually.be.fulfilled.and.have.property('length').greaterThan(0);
    }).timeout(4000);

    it('items(): hub.items.list (for specific device)', async function() {
      const testDeviceId = await this.hub.devices().then((devices: any[]) => devices.randomElem()._id);
      return expect(this.hub.items(testDeviceId).then(items => items[0])).to.eventually.be.fulfilled
        .and.to.have.property('deviceId').to.be.equal(testDeviceId);
    }).timeout(4000);

    it('items(): hub.items.list (for non-existant device)', function() {
      return expect(this.hub.items('bogusDeviceId')).to.eventually.be.fulfilled.and.have.property('length').equal(0);
    }).timeout(4000);

    it('item(): item with name for device', async function() {
      const testDevice = await this.hub.devices().then((devices: any[]) => devices.randomElem());
      const testItem = await this.hub.items(testDevice._id).then((items: any[]) => items.randomElem());
      return expect(this.hub.item(testItem.name, testDevice._id).then(items => items[0])).to.eventually.be.fulfilled
        .and.to.have.property('_id').to.be.equal(testItem._id);
    }).timeout(4000);

    it('scenes(): hub.scenes.list', function() {
      return expect(this.hub.scenes()).to.eventually.be.fulfilled.and.have.property('length').greaterThan(0);
    }).timeout(4000);

    it('scene(): scene with name', async function() {
      const testScene = await this.hub.scenes().then((scenes: any[]) => scenes.randomElem());
      return expect(this.hub.scene(testScene.name)).to.eventually.be.fulfilled
        .and.to.have.property('_id').to.be.equal(testScene._id);
    }).timeout(4000);

    it('scene(): scene with name - non-existant', function() {
      return expect(this.hub.scene('non-existent-scene')).to.eventually.to.be.undefined;
    }).timeout(4000);

    it('rooms(): hub.room.list', function() {
      return expect(this.hub.rooms()).to.eventually.be.fulfilled.and.have.property('length').greaterThan(0);
    }).timeout(4000);

    it('room(): room with name', async function() {
      const testRoom = await this.hub.rooms().then((rooms: any[]) => rooms.randomElem());
      return expect(this.hub.room(testRoom.name)).to.eventually.be.fulfilled
        .and.to.have.property('_id').to.be.equal(testRoom._id);
    }).timeout(4000);

    it('houseModes(): hub.modes.get', function() {
      return expect(this.hub.houseModes().then(modes => modes.map(mode => mode._id)))
        .to.eventually.be.members(['1', '2', '3', '4']);
    }).timeout(4000);

    it('houseMode(): house mode with name', function() {
      return expect(this.hub.houseMode('Vacation')).to.eventually.be.fulfilled
        .and.to.have.property('name').equal('Vacation');
    }).timeout(4000);

    it('houseMode(): invalid mode name (type)', function() {
      return expect(this.hub.houseMode(1)).to.eventually.be.undefined;
    }).timeout(4000);

    it('currentHouseMode(): valid mode id', function() {
      return expect(this.hub.currentHouseMode()).to.eventually.be.fulfilled
        .and.to.have.property('_id').that.is.oneOf(['1', '2', '3', '4']);
    }).timeout(4000);

    it('currentHouseMode(): valid mode name', function() {
      return expect(this.hub.currentHouseMode()).to.eventually.be.fulfilled
        .and.to.have.property('name').that.is.oneOf(['Home', 'Night', 'Away', 'Vacation']);
    }).timeout(4000);

  });

  describe('Hub Event Observations', function() {
    const login = 'hub.offline.login.ui';
    it(`addObserver(): ${login}`, function() {
      const handler: ObservationHandler = (msg) => expect(msg.method).to.be.equal(login);
      const predicate: MessagePredicate = (msg) => msg.method === login;
      return EzloHub.createHub(hubSerial, resolverStrategy)
        .then((hub) => {
          hub.addObserver(predicate, handler);
          hub.connect().then(() => hub.disconnect());
        });
    }).timeout(5000);
  });

  describe('Hub Actions', function() {
    before('initialize hub test instance', async function() {
      this.timeout(4000);
      this.hub = await EzloHub.createHub(hubSerial, resolverStrategy).then(hub => hub.connect());
    });
    after(function () {
      this.hub.disconnect();
    });


    it('setHouseMode(): hub.modes.switch to current mode', async function() {
      const currentMode = await this.hub.currentHouseMode();
      return expect(this.hub.setHouseMode(currentMode._id)).to.eventually.be.equal(currentMode._id);
    }).timeout(5000);

    it('setHouseMode(): hub.modes.switch to new mode', async function() {
      const curMode = await this.hub.houseMode();
      const newMode = ['1', '2', '3', '4'].filter(m => m !== curMode).randomElem();
      return expect(this.hub.setHouseMode(newMode)).to.eventually.be.equal(newMode);
    }).timeout(30250); //Ezlo Hubs default switch time is 30 seconds.

    it('setHouseMode(): hub.modes.switch to invalid mode', function() {
      return expect(this.hub.setHouseMode(1)).to.eventually.be.rejected;
    }).timeout(4000);

    it('runScene()', function() {
      // Allow tests to find hubs without the scene with the test name...
      const testSceneName = 'Test';
      return this.hub.scene(testSceneName)
        .then((scene) => {
          if (scene) {
            console.log(chalk.gray(`        ➔ running scene "${scene.name}:${scene._id}"`));
            return expect(this.hub.runScene(scene._id)).to.eventually.be.fulfilled;
          } else {
            console.log(chalk.cyan(`        ➔ unable to verify runScene() because the scene "${testSceneName}" does not exist`));
            return expect(Promise.resolve()).to.eventually.be.fulfilled;
          }
        });
    }).timeout(10000);

    it.skip('setItemValue()', function() {
      expect.fail('Test case not yet implemented.');
    });
  });

  describe.skip('Keep-alive test', function() {
    before('initialize hub test instance', async function() {
      this.hub = await EzloHub.createHub(hubSerial, resolverStrategy)
        .then((hub) => hub.connect());
      console.log(`Connected to ${hubSerial}`);
    });
    after(function () {
      this.hub.disconnect();
    });

    it('connection-interrupt test', function(done) {
      console.log('Starting connection test - interrupt connection now');
      setTimeout(() => {
        done();
      }, 580 * 1000);

    }).timeout(600 * 1000);
  });
});