/* eslint-disable no-console */
import { EzloHub, HubIdentifier, ObservationHandler, MessagePredicate, discoverEzloHubs, EzloIdentifier } from '../src/EzloHub';
import { EzloCloudResolver } from '../src/EzloCredentials';
import * as MDNSResolver from 'mdns-resolver';

import * as chai from 'chai';
import { expect } from 'chai';
chai.use(require('chai-as-promised'));

import mlog from 'mocha-logger';

///////
// Change the test user credentials to your MIOS portal user in order run these tests
//
import miosUser from './miosTestUser.json';
//
// To execute these tests, create a file test/miosTestUser.json with the following json
// that includes your MIOS portal username and password (required to authenticate with hubs)
// {
//   "username" : "portal user",
//   "password" : "portal password"
// }

const resolverStrategy: EzloCloudResolver = new EzloCloudResolver(miosUser.username, miosUser.password);
let registeredHubs: HubIdentifier[];
let availableHubs: HubIdentifier[];
let hubSerial: HubIdentifier = 'undefined';

describe('EzloHub Test Suite', function() {

  before('Identify available test hub(s)', async function() {

    async function onlineHubs(hubs: string[]): Promise<HubIdentifier[]> {
      const onlineHubs: HubIdentifier[] = [];
      for (const hubSerial of hubs) {
        try {
          await MDNSResolver.resolve4(`HUB${hubSerial}.local`);
          onlineHubs.push(hubSerial);
          mlog.success(`Hub ${hubSerial} is available for test execution`);
        } catch (e) {
          mlog.error(`Hub ${hubSerial} is offline`);
        }
      }
      return onlineHubs;
    }

    this.timeout(30000);  // Allow ample time to retrieve the registered hubs from the MIOS/Ezlo cloud and check online status
    console.log('    Setup - identify locally testable hubs');

    registeredHubs = await resolverStrategy.hubs();
    mlog.log(`Registered hubs: ${registeredHubs}`);

    availableHubs = await onlineHubs(registeredHubs);

    hubSerial = availableHubs[Math.floor(Math.random() * availableHubs.length)];
    mlog.log(`Hub ${hubSerial} randomly selected for test execution`);
  });

  describe('Secure Login (for each locally available ezlo hub)', function() {
    it('Connect to each available hub', function() {
      this.timeout(availableHubs.length * 5000);
      const hubs: Promise<string>[] = availableHubs.map(serial => {
        return new Promise((resolve, reject) => {
          EzloHub.createHub(serial, resolverStrategy)
            .then((hub) => {
              hub.info().then((info) => {
                mlog.log(`Securely connected to local hub ${serial}, model: ${info.model}, `
                + `architecture: ${info.architecture}, firmware: ${info.firmware}`);
                expect(info, 'Info should contain serial property').to.have.property('serial');
                hub.disconnect().then(() => resolve('successful connection'));
              });
            })
            .catch((err) => reject(err));
        });
      });
      return expect(Promise.all(hubs)).to.be.eventually.fulfilled;
    });
  });

  describe('Hub Properties', function() {
    before('initialize hub test instance', async function() {
      this.hub = await EzloHub.createHub(hubSerial, resolverStrategy);
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
      return this.hub.devices()
        .then((devices) => {
          expect(devices.length, 'No devices returned').to.be.greaterThan(0);
          expect(devices[0], 'device should have an id').to.have.property('_id');
        });
    });

    it('items(): hub.items.list', function() {
      return this.hub.items()
        .then((items) => {
          expect(items.length, 'No items returned').to.be.greaterThan(0);
        });
    }).timeout(5000);

    it('items(): hub.items.list (for specific device)', async function() {
      const testDeviceId = await this.hub.devices().then((devices) => devices[0]._id);
      const items = await this.hub.items(testDeviceId);
      expect(items.length, 'No items returned').to.be.greaterThan(0);
      expect(items[0].deviceId, 'Items are not for queried device').to.be.equal(testDeviceId);
    });

    it('items(): hub.items.list (for non-existant device)', function() {
      return this.hub.items('bogusDeviceId')
        .then((items) => {
          expect(items.length, 'No items returned').to.be.equal(0);
        });
    });

    it('scenes(): hub.scenes.list', function() {
      return this.hub.scenes()
        .then((scenes) => {
          expect(scenes.length, 'No scenes returned').to.be.greaterThan(0);
        });
    });

    it('scene(): scene with name', function() {
      return this.hub.scenes()
        .then((scenes) => {
          expect(scenes.length, 'No scenes returned').to.be.greaterThan(0);
          const randomId = Math.floor(Math.random() * scenes.length);
          return { name: scenes[randomId].name, id: scenes[randomId]._id };
        })
        .then((randomScene) => {
          this.hub.scene(randomScene.name)
            .then((scn) => {
              return expect(scn._id).to.be.equal(randomScene.id);
            });
        });
    });

    it('scene(): scene with name - non-existant', function() {
      return expect(this.hub.scene('non-existent-scene')).eventually.to.be.undefined;
    });


    it('rooms(): hub.room.list', function() {
      return this.hub.rooms()
        .then((rooms) => {
          expect(rooms.length, 'No items returned').to.be.greaterThan(0);
        });
    });

    it('houseMode(): hub.modes.current.get', function() {
      return this.hub.houseMode()
        .then((mode) => expect(['0', '1', '2', '3']).to.include(mode));
    });

    it('houseModeName(): hub.modes.get', function() {
      return this.hub.houseModeName()
        .then((name) => expect(['Home', 'Away', 'Night', 'Vacation']).to.include(name));
    });

  });

  describe('Hub Discovery', function() {
    it('discoverEzloHubs()', function() {
      return new Promise((resolve) => {
        const discoveredHubs: EzloHub[] = [];

        discoverEzloHubs(resolverStrategy, (hub) => discoveredHubs.push(hub), 1500);

        setTimeout(() => {
          expect(discoveredHubs.length, 'Failed to discover any hub before test time limit reached').to.be.greaterThan(0);
          expect(discoveredHubs[0]).be.instanceOf(EzloHub);
          expect(discoveredHubs.map(h => h.identity)).to.have.members(availableHubs);
          mlog.success(`Discovered hubs: ${discoveredHubs.map(h => h.identity).sort()}`);
          resolve('pass');
        }, 2400);
      });
    }).timeout(2500);
  });

  describe('Hub Event Observation', function() {
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

  describe.skip('Hub actions', function() {
    before('initialize hub test instance', async function() {
      this.hub = await EzloHub.createHub(hubSerial, resolverStrategy);
    });
    after(function () {
      this.hub.disconnect();
    });

    it('setItemValue()', function() {
      expect.fail('Test case not yet implemented.');
    });

    it('runScene()', function() {
      return this.hub.scene('Return')
        .then((id) => {
          if (id) {
            console.log('running scene ', id);
            return expect(this.hub.runScene(id)).eventually.to.be.fulfilled;
          }
        })
        // Allow tests to find hubs without the scene with the test name...
        .catch((err) => console.log(err));
    }).timeout(4000);

    it('setHouseMode(): hub.modes.switch', function() {
      const newMode = 1;
      return this.hub.setHouseMode(newMode)
        .then(() => this.hub.houseMode()
          .then((mode) => expect(mode).is.equal(newMode)))
        .catch((err) => console.log(err));
    });
  });

  describe.skip('Keep-alive test', function() {
    before('initialize hub test instance', async function() {
      this.hub = await EzloHub.createHub('45006642', resolverStrategy)
        .then((hub) => hub.connect());
      console.log('Connected to 45006642');
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