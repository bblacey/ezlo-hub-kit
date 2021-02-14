/***
 * EzloCloudResolver strategy.
 *
 * Implements the CredentialsResolver strategy for a hub credentials
 * Cloud store.  The strategy first authenticates with the MIOS Portal
 * to retrieve an Ezlo Cloud authorization token and finally retrieves
 * the hub credentials store that contains the hub authorization
 * tokens required to establish a local wss:// to a given hub.
 *
 * The strategy caches the all AuthTokens and automatically refreshes
 * the appropriate tokens if they expire during the lifecycle of the
 * CredentialsResolver.  Application developers are encouraged to
 * retain and re-use an EzloCloudResolver for optimal performance
 * from caching.
 *
 */
import { HubCredentials, CredentialsResolver } from '../EzloCredentials';
import { HubIdentifier } from '../EzloHub';
import crypto from 'crypto';
import https from 'https';
import url from 'url';

export class EzloCloudResolver implements CredentialsResolver {
  private readonly username: string;
  private readonly passwordHash: string;
  private portalAuth?: PortalAuth;
  private cloudAuth?: CloudAuth;
  private controllerDB?: any;

  constructor(username: string, password: string) {
    this.username = username;
    // Only retain the hashed password to reduce attack surface
    this.passwordHash = crypto.createHash('sha1')
      .update(username.toLowerCase())
      .update(password)
      .update('oZ7QE6LcLJp6fiWzdqZc') //Salt
      .digest('hex');
  }

  /**
   * Validates an authorization credential/token.  Valid means defined and
   * not expired
   *
   * @param auth - the authorization token to validate
   * @returns validity
   */
  private static authIsValid(auth?: AuthToken): boolean {
    return auth !== undefined && auth.expired() === false;
  }

  /**
   * Retrieves the MMS authorization crendentials from the MIOS portal.  This
   * requires a valid username and password.
   *
   * @returns portal authentication object representing the MMS authorization credentials
   */
  private portalAuthenticate(): Promise<PortalAuth> {
    const endpoint =
    `https://vera-us-oem-autha11.mios.com/autha/auth/username/${this.username}?SHA1Password=${this.passwordHash}&PK_Oem=1&TokenVersion=2`;

    if (EzloCloudResolver.authIsValid(this.portalAuth)) {
      return Promise.resolve(this.portalAuth!);
    }

    return new Promise((resolve, reject) => {
      htRequest(endpoint)
        .then((authResponse) => {
          this.portalAuth = new PortalAuth(authResponse.Identity, authResponse.IdentitySignature);
          resolve(this.portalAuth);
        })
        .catch((err) => {
          reject(new Error(`Failed to login to MIOS Portal due to error ${err}`));
        });
    });
  }

  /**
   * Retrieves a cloud authorization token from ezlo cloud using the mios MMS authroization
   * credentials/
   *
   * @returns portal authentication object representing the MMS authorization credentials
   */
  private cloudAuthenticate(): Promise<CloudAuth> {
    const endpoint = 'https://cloud.ezlo.com/mca-router/token/exchange/legacy-to-cloud/';

    if (EzloCloudResolver.authIsValid(this.cloudAuth)) {
      return Promise.resolve(this.cloudAuth!);
    }

    return new Promise((resolve, reject) => {
      this.portalAuthenticate()
        .then((portalAuth) => {
          htRequest(Object.assign({}, url.parse(endpoint), {headers:  portalAuth.toHeaderRepresentation()}))
            .then((authResponse) => {
              this.cloudAuth = new CloudAuth(authResponse.token);
              resolve(this.cloudAuth);
            });
        })
        .catch((err) => {
          reject(new Error(`Failed to authenticate with Ezlo Cloud API due to error ${err}`));
        });
    });
  }

  /**
   * Retrieves ezlo controllers and local authentication credentials associated with
   * MIOS/ezlo account used for this session
   *
   * In the spirit of local connections, the controller data object is cached until
   * the authorization credentials expire (typically 24 hours from authorization request)
   *
   * @returns controller data object
   */
  private controllerData(): Promise<any> {
    const endpoint = 'https://api-cloud.ezlo.com/v1/request';

    if (this.controllerDB && EzloCloudResolver.authIsValid(this.cloudAuth)) {
      return Promise.resolve(this.controllerDB);
    }

    return new Promise((resolve, reject) => {
      this.cloudAuthenticate()
        .then((auth) => {
          const rpc = {call: 'access_keys_sync', version: '1', params: { version: 53, entity: 'controller', uuid: Math.random() }};
          const postHeaders = Object.assign(auth.toHeaderRepresentation(), {'content-type': 'application/json; charset=UTF-8'});
          htRequest(Object.assign({}, url.parse(endpoint), {method: 'POST', headers: postHeaders}), JSON.stringify(rpc))
            .then((res) => {
              this.controllerDB = res.data;
              resolve(this.controllerDB);
            })
            .catch(err => {
              reject(new Error(`Failed to retrieve access_key_sync due to error: ${err}`));
            });
        })
        .catch((err) => {
          reject(new Error(`Failed to authenticate with cloud due to error: ${err}`));
        });
    });
  }

  /**
   * Retrieve the local hub authentication credentials for a given hub identified by serial number
   *
   * @param hubSerial - serial number for hub
   * @returns local authentication credentials
   */
  public credentials(hubSerial: HubIdentifier): Promise<HubCredentials> {
    return new Promise((resolve, reject) => {
      this.controllerData()
        .then(info => {
          const controller: any = Object.values(info.keys)
            .filter((r: any) => r.meta.entity.type === 'controller' && r.meta.entity.id === hubSerial)[0];
          const user: any = Object.values(info.keys)
            .filter((r: any) => r.meta.entity.type === 'user' && r.data !== null && r.meta.target.uuid === controller.meta.entity.uuid)[0];
          resolve( {user: user.meta.entity.uuid, token: user.data.string, hubIdentity: hubSerial} as HubCredentials) ;
        })
        .catch(() => {
          reject(new Error(`User ${this.username} is not authorized for hub ${hubSerial}`));
        });
    });
  }

  /**
   * Retrieve a list of hubs known by ezlo and associated with the MIOS account.
   *
   * @returns an array of hub serial numbers
   */
  public hubs(): Promise<HubIdentifier[]> {
    return new Promise((resolve, reject) => {
      this.controllerData()
        .then(info => {
          const controllers: any = Object.values(info.keys)
            .filter((r: any) => r.meta.entity.type === 'controller')
            .map((r: any) => r.meta.entity.id)
            .sort();
          resolve(Array.from(new Set(controllers)));
        })
        .catch((err) => {
          reject(new Error(`Failed to retrieve controller hubs from cloud due to error: ${err}`));
        });
    });
  }
}

/**
* Base class that encapsulates and represents an authorization crendtial
*/
abstract class AuthToken {
  constructor(private expiration: number = 0) {}
  expired(): boolean {
    return Date.now() < this.expiration;
  }
}

/**
* Represents, and encapsulates a MIOS portal MMS authorization crendtial
*/
class PortalAuth extends AuthToken {
  constructor(public identity: string, public signature: string) {
    super(JSON.parse(Buffer.from(identity, 'base64').toString()).Expires);
  }

  toHeaderRepresentation = (): Record<string, unknown> => {
    return { MMSAuth : this.identity, MMSAuthSig : this.signature };
  };
}

/**
* Represents, and encapsulates an Ezlo Cloud authorization crendtial
*/
class CloudAuth extends AuthToken {
  constructor(public token: string) {
    super(JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).token.expires_ts);
  }

  toHeaderRepresentation = (): Record<string, unknown> => {
    return { authorization: `Bearer ${this.token}` };
  };
}

/**
* Promise-based https request
*/
function htRequest(urlOptions: any, data = ''): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(urlOptions,
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk.toString()));
        res.on('error', err => reject(err));
        res.on('end', () => {
          if (res.statusCode! < 200 || res.statusCode! > 299) {
            reject(new Error(`Request failed. ${res.statusCode}, body: ${body}`));
          }
          try {
            const payload = JSON.parse(body);
            if (payload?.data?.error_text) {
              reject(new Error(`Request returned error_text: ${payload.data.error_text}`));
            }
            // resolve({statusCode: res.statusCode, headers: res.headers, body: payload});
            resolve(payload);
          } catch(err) {
            reject(new Error(`Failed to parse http body as json due to error: ${err}`));
          }
        });
      });
    req.on('error', error => reject(`HTTPS Request failed with error: ${error}`));
    req.write(data, 'binary');
    req.end();
  });
}