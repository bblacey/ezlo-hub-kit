/***
 * ConfigFileResolver strategy.
 *
 * Implements the CredentialsResolver strategy for a locally available
 * hub credentials configuration file store.  The credentials store
 * is a dictionary of hubIdentifier: {hub, user, token} tuple.  The
 * most direct way to create a credentials store is to execute the
 * test utility createHubCredentialsFile as follows.
 *
 *     ./test/utils/createHubCredentialsFile --credentialsFile <path>
 */
import { HubCredentials, CredentialsResolver } from '../EzloCredentials';
import { HubIdentifier } from '../EzloHub';
import * as fs from 'fs';

declare type CredentialsStore = Record<HubIdentifier, HubCredentials>;

export class ConfigFileResolver implements CredentialsResolver {

  constructor(private filePath: string) {}

  /**
   * Read the local credentials store
   *
   * @param filePath - path to the configuration file
   * @returns CredentialsStore - hub authentication credentials collection
   */
  private static readConfig(filePath: string): Promise<CredentialsStore> {
    return new Promise((resolve, reject) => {
      try {
        const buffer = fs.readFileSync(filePath, {encoding: 'utf-8'});
        const config = JSON.parse(buffer);
        resolve(config);
      } catch (err) {
        reject(new Error(`Unable to read config file ${filePath} due to error ${err}`));
      }
    });
  }

  /**
   * Retrieve the local hub authentication credentials for a given hub identified by serial number
   *
   * @param hubSerial - serial number for hub
   * @returns local authentication credentials
   */
  public credentials(hubSerial: string): Promise<HubCredentials> {
    return new Promise((resolve, reject) => {
      ConfigFileResolver.readConfig(this.filePath)
        .then((config) => {
          const hubEntry = config[hubSerial];
          if ( !hubEntry ) {
            reject(new Error(`FileResolver failed - no ${hubSerial} hub entry in config file ${this.filePath}`));
          }
          resolve( {user: hubEntry.user, token: hubEntry.token, hubIdentity: hubSerial} as HubCredentials );
        })
        .catch((err) => reject(err));
    });
  }

  /**
   * Retrieve a list of hub entries in the local credentials store.
   *
   * @returns an array of hub serial numbers
   */
  public hubs(): Promise<HubIdentifier[]> {
    return new Promise((resolve, reject) => {
      ConfigFileResolver.readConfig(this.filePath)
        .then((config) => {
          resolve(Object.keys(config).sort());
        })
        .catch((err) => reject(err));
    });
  }
}