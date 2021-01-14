import { ConfigFileResolver, EzloCloudResolver, HubCredentials } from '../src/EzloCredentials';

import * as chai from 'chai';
import { expect } from 'chai';
chai.use(require('chai-as-promised'));

import mlog from 'mocha-logger';
import * as fs from 'fs';

///////
// Change the test user credentials to your MIOS portal user in order run these tests
import miosUser from './miosTestUser.json';

describe('EzloCredentials Test Suite', function() {

  describe('FileResolver Tests', function() {

    const configFile = './test/testHubCredentials.json';
    const resolver = new ConfigFileResolver(configFile);

    before('Check testHubCredentialsFile exists', function() {
      if ( !fs.existsSync(configFile) ) {
        mlog.error(`Test Credentials File missing - create with createHubCredentialsFile.js --output ${configFile}`);
        return Promise.reject(`${configFile} does not exist, create and re-run the tests`);
      }
    });

    it('hubs(): registered hubs', function() {
      return resolver.hubs()
        .then((hubs) => {
          expect(hubs).to.be.an('array');
          expect(hubs).property('length').is.greaterThan(0);
          hubs.forEach((id) => expect(/^\d+$/.test(id), 'Hub identifiers should be all digits').is.true);
        });
    });

    it('credentials(): credentials from FileResolver for known hubs', async function() {
      const expectations: Promise<HubCredentials|string>[] = [];
      for (const hub of await resolver.hubs()) {
        expectations.push(new Promise((resolve, reject) => {
          resolver.credentials(hub)
            .then((credentials: HubCredentials) => {
              expect(credentials, 'user property should exist').to.have.property('user');
              expect(credentials, 'token property should exist').to.have.property('token');
              expect(credentials, 'hubIdentity property should exist').to.have.property('hubIdentity');
              resolve('pass');
            })
            .catch((err: Error) => reject(err));
        }));
      }
      return Promise.all(expectations);
    });

    it('credentials(): throw for missing credentials file - invalid path', async function() {
      const testHub = (await resolver.hubs())[0];
      const testResolver = new ConfigFileResolver('./test/configFileThatDoesNotExist.json');
      return expect(testResolver.credentials(testHub)).is.rejected;
    });

    it('credentials(): throw for missing or invalid hub entry', function() {
      return expect(resolver.credentials('NonExistantHub')).eventually.is.rejected;
    });

  });

  describe('EzloCloudResolver Tests', function() {

    const resolver = new EzloCloudResolver(miosUser.username, miosUser.password);

    // increase test-case timeout for Cloud requests
    this.timeout(3500);

    it('hubs(): registered hubs', function() {
      return resolver.hubs()
        .then((hubs) => {
          expect(hubs).to.be.an('array');
          expect(hubs).property('length').is.greaterThan(0);
          hubs.forEach((id) => expect(/^\d+$/.test(id), 'Hub identifiers should be all digits').is.true);
        });
    });

    it('hubs(): throw for non-existant MIOS user', function() {
      const resolver = new EzloCloudResolver('nonexistentuser', 'passwd');
      return expect(resolver.hubs()).eventually.is.rejected;
    });

    it('credentials(): credentials from Cloud for known hubs', async function() {
      const expectations: Promise<HubCredentials|string>[] = [];
      for (const hub of await resolver.hubs()) {
        expectations.push(new Promise((resolve, reject) => {
          resolver.credentials(hub)
            .then((credentials: HubCredentials) => {
              expect(credentials, 'user property should exist').to.have.property('user');
              expect(credentials, 'token property should exist').to.have.property('token');
              expect(credentials, 'hubIdentity property should exist').to.have.property('hubIdentity');
              resolve('pass');
            })
            .catch((err: Error) => reject(err));
        }));
      }
      return Promise.all(expectations);
    });

    it('credentials(): throw for missing or invalid hub entry', function() {
      return expect(resolver.credentials('NonExistantHub')).eventually.is.rejected;
    });

  });

});