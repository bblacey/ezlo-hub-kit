/* eslint-disable no-console */
import { HubCredentials, CredentialsResolver } from './EzloCredentials';

import Bonjour from 'bonjour';
import * as MDNSResolver from 'mdns-resolver';
import WebSocket from 'ws';
import { rejects } from 'assert';
const WebSocketAsPromised = require('websocket-as-promised');

export declare type EzloIdentifier = string;
export declare type HubIdentifier = EzloIdentifier;
export declare type Message = Record<string, any>;
export declare type ObservationHandler = (message: Message) => void;
export declare type MessagePredicate = (message: Message) => boolean;

export const UIBroadcastMessagePredicate: MessagePredicate = (msg: Message) => msg.id === 'ui_broadcast';

interface Observer {
  readonly predicate: MessagePredicate;
  readonly handler: ObservationHandler;
}

/**
 * Discover Ezlo hubs advertised on mdns/zeroconf/bonjour calling callback with hub instance. Discovery continues
 * until duration elapses or infinitely if duration is <= 0
 *
 * @param credentialsResolver - the credentials resolver to use for hub creation
 * @param callback - callback whenever a hub is discovered
 * @param duration - optional duration for discovery
 */
export function discoverEzloHubs(credentialsResolver: CredentialsResolver, callback: (hub: EzloHub) => void, duration = 0) {
  const bonjour = Bonjour();
  const ezloBrowser = bonjour.find( { type: 'ezlo' } );

  ezloBrowser.on('up', (service: Bonjour.RemoteService) => {
    // console.log('Discovered HUB %s type: %s, serial: %s, host: %s (%s:%s), firmware: %s',
    //   service.fqdn, service.txt['hub type'], service.txt.serial, service.host, service.referer.address,
    //   service.port, service.txt['firmware version']);
    EzloHub.createHub(service.txt.serial, credentialsResolver)
      .then((hub) => callback(hub))
      .catch((err) => console.log('Failed to instantiate discovered hub %s due to error %O', service.txt.serial, err));
  });

  ezloBrowser.on('down', (service: Bonjour.RemoteService) => {
    console.log('Hub %s disappeared', service.txt.serial);
  });

  if (duration > 0) {
    setTimeout(() => bonjour.destroy(), duration);
  } else {
    setInterval(() => {
      try {
        ezloBrowser.update();
      } catch (err) {
        console.log(`mdnsBrowser update failed with err ${err}`);
      }
    }, 30000);
  }
}

export class EzloHub {
  public identity: HubIdentifier;
  private _isConnected = false;
  private wsp: typeof WebSocketAsPromised;
  private observers: Observer[] = [];
  private keepAliveDelegate: KeepAliveAgent;

  constructor(public url: string, private credentials: HubCredentials) {
    this.identity = credentials.hubIdentity;
    // Create the websocket and register observer dispatch handlers
    // NOTE: Override ECC ciphers to prevent over-burdening crytpo on Atom w/ESP32
    this.wsp = new WebSocketAsPromised(url, {
      createWebSocket: (url: string) => new WebSocket(url, { rejectUnauthorized: false, ciphers: 'AES256-SHA256' }),
      extractMessageData: (event: unknown) => event,
      packMessage: (data: unknown) => JSON.stringify(data),
      unpackMessage: (data: string) => JSON.parse(data),
      attachRequestId: (data: unknown, requestId: string|number) => Object.assign({ id: requestId }, data),
      extractRequestId: (data: Record<string, string|number>) => data && data.id,
    });

    this.keepAliveDelegate = new KeepAliveAgent(this, this.wsp);
    this.wsp.onUnpackedMessage.addListener((message: Message) => this.notifyObservers(message));
  }

  /**
   * Creates a hub instance given a hub serial number and a credentials resolver
   *
   * @param hubSerial - the serial number for the hub
   * @param credentialsResolver - a credentials resolver that provides the credentials for the
   * given serial number
   * @returns EzloHub instance
   */
  static async createHub(hubSerial: HubIdentifier, credentialsResolver: CredentialsResolver): Promise<EzloHub> {
    try {
      const credentails = await credentialsResolver.credentials(hubSerial);
      const hostname = `HUB${hubSerial}.local`;
      const ipaddress = await MDNSResolver.resolve4(hostname);
      const url = `wss://${ipaddress}:17000`;
      return new EzloHub(url, credentails);
    } catch(err) {
      console.log('Failed to instantiate ezlo hub due to error: ', err);
      return err;
    }
  }

  /**
   * Establishes a local authenticated secure websocket connection with the ezlo hub
   *
   * Note, EzloHub automatically manages the connection state.  Application developers
   * do not need to invoke this method.  It is declared public purely for unit testing.
   *
   * @returns {Promise<EzloHub>} hub instance that connected.
   */
  connect(): Promise<EzloHub> {
    if (this._isConnected === true) {
      return Promise.resolve(this);
    }

    return new Promise((resolve, reject) => {
      this.wsp.open()
        .then(() => this.wsp.sendRequest({method: 'hub.offline.login.ui',
          params: { user: this.credentials.user, token: this.credentials.token }}))
        .then((response: any) => {
          if (response.error !== null && response.error.data !== 'user.login.alreadylogged') {
            reject(new Error(`Login failed for ${this.url} due to error ${response.error.data}`));
          }
          this._isConnected = true;
          // setImmediate(() => this.configureKeepAlive());
          resolve(this);
        })
        .catch((err) => {
          reject(new Error(`Login failed - unable to connect to ${this.url} due to error ${err}`));
        });
    });
  }

  /**
   * Terminates secure websocket connection
   *
   * NOTE:  Apps should call this to dispose of resources when the
   * EzloHub instance is no longer needed.
   *
   * @return Promise<void> - disconnect complete
   */
  disconnect(): Promise<void> {
    this._isConnected = false;
    return this.wsp.close();
  }

  /**
   * Connected/disconnected
   *
   * @returns {boolean} Connected = true, not yet connected/disconnected = false.
   */
  public isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Returns information about the hub such as architecture, build, model, serial #, etc.
   *
   * @returns an info object
   */
  public info(): Promise<any> {
    return this.sendRequest({ method: 'hub.info.get', params: {} });
  }

  /**
   * Returns hub data (devices, items, scenes)
   *
   * @returns collection of devices, items, rooms and scenes
   */
  public data(): Promise<Array<any>> {
    const request = {
      method: 'hub.data.list',
      'params': {
        'devices':{
          'ids':[], 'fields': { 'include':[] },
        },
        'items':{
          'ids':[], 'fields': { 'include':[] },
        },
        'rooms':{
          'ids':[], 'fields': { 'include':[] },
        },
        'scenes':{
          'ids':[], 'fields': { 'include':[] },
        },
      },
    };
    return this.sendRequest(request).then((res) => res);
  }

  /**
   * Returns devices paired with the hub
   *
   * @returns collection of devices
   */
  public devices(): Promise<Array<any>> {
    return this.sendRequest({ method: 'hub.devices.list', params: {} }).then((res) => res.devices);
  }

  /**
   * Returns an array of item objects from the hub
   *
   * @returns collection of items
   */
  public items(device?: string): Promise<Array<any>> {
    const request = {
      method: 'hub.items.list',
      params: {},
    };
    if (device) {
      request.params = {deviceIds: [device]};
    }
    return this.sendRequest(request).then((res) => res.items);
  }

  /**
   * Returns the scenes collection
   *
   * @returns collection of scenes
   */
  public scenes(): Promise<Array<any>> {
    return this.sendRequest({ method: 'hub.scenes.list', params: {} }).then((res) => res.scenes);
  }

  /**
   * Returns the scene id for the scene with name
   *
   * @param name - scene name
   * @returns scene
   */
  public scene(name: string): Promise<Record<EzloIdentifier, unknown>> {
    return this.scenes().then((scenes) => scenes.filter((scn) => scn.name === name)[0]);
    // .then((scenes) => scenes.filter((scn) => scn.name === name)[0] || Promise.reject(new Error(`Scene ${name} does not exist`)));
  }

  /**
   * Returns the rooms
   *
   * @returns collection of rooms
   */
  public rooms(): Promise<Array<any>> {
    return this.sendRequest({ method: 'hub.room.list', params: {} }).then((res) => res);
  }

  /**
   * Returns current House Mode
   *
   * @returns collection of devices
   */
  public houseMode(): Promise<string> {
    return this.sendRequest({ method: 'hub.modes.current.get', params: {} }).then((res) => res.modeId);
  }

  /**
   * Returns the current House Mode Name
   */
  public async houseModeName(): Promise<EzloIdentifier> {
    return this.sendRequest({ method: 'hub.modes.get', params: {} })
      .then((res) => res.modes.filter((mode: any) => res.current === mode._id)[0].name);
  }

  /**
   * Returns the network Interface objects for the hub
   *
   * @return collection of network interfaces
   */
  public networkInterfaces(): Promise<Array<any>> {
    return this.sendRequest({method: 'hub.network.get', params: {} }).then((res) => res.interfaces);
  }

  /**
   * Set the value for one or more items.  In the case of multiple items,
   * a z-wave multicast message will be sent to the list of items
   *
   * @param items - items for which to set value
   * @param value - the value to set on item
   */
  public setItemValue(items: EzloIdentifier | [EzloIdentifier], value: unknown): Promise<any> {
    let params;
    if (typeof items === 'string') {
      params = {_id: items, value: value};
    } else {
      params = {ids: items, value: value};  //multicast
    }
    return this.sendRequest({method: 'hub.item.value.set', params: params});
  }

  /**
   * Run a scene
   *
   * @param scene - scene identifier
   * @returns msg - response result from json rpc request
   */
  public runScene(scene: EzloIdentifier): Promise<any> {
    return this.sendRequest({method: 'hub.scenes.run', params: { sceneId: scene} })
      .then((res) => res.result)
      .catch((err) => {
        throw err;
      });
  }

  /**
   * Set the House Mode
   *
   * @param mode - mode identifier
   * @returns msg - response result from json rpc request
   */
  public setHouseMode(mode: EzloIdentifier): Promise<any> {
    return this.sendRequest({method: 'hub.modes.switch', params: { modeId: mode } }).then((res) => res.result);
  }

  /**
   * Register an observer of a given message using an introspection predicate
   *
   * @param predicate - represents the messages of interest
   * @param handler - callback to invoke when the predicate is true
   */
  public addObserver(predicate: MessagePredicate, handler: ObservationHandler) {
    const observer: Observer = { predicate: predicate, handler: handler };
    this.observers.push( observer );
  }

  /**
   * Override object description to return hub identity
   */
  public toString = (): string => {
    return this.identity;
  };

  /**
   * Notifies subscribed observers of the registered predicate is true
   *
   * @param message - message to evaluate against registered predicates
   */
  private notifyObservers(message: Message): void {
    this.observers.filter(observer => observer.predicate( message ))
      .forEach(observer => observer.handler(message));
  }

  /**
   * Send a json-rpc request to the hub and parse the result
   *
   * @param request - json-rpc request object
   * @returns the json parsed result object from the response json.
   */
  private sendRequest(request: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.connect()
        .then(() => this.wsp.sendRequest(request))
        .then((response) => {
          if (response.error !== null) {
            reject(new Error(`Request to ${this.identity} failed with ${response.error.data} - Request: ${JSON.stringify(request)}`));
          }
          resolve(response.result);
        })
        .catch((err) => {
          reject(new Error(`Request to ${this.identity} failed due to error ${err}`));
        });
    });
  }
}

/**
 * Hub Connection Keep Alive Agent
 *
 * Re-establish the hub connection if remote-hub pings cease
 */
class KeepAliveAgent {
  private pingExpiry?: NodeJS.Timeout = undefined;
  private reconnectInterval?: NodeJS.Timeout = undefined;

  constructor(private hub: EzloHub, private wsp: typeof WebSocketAsPromised) {
    wsp.onOpen.addListener(() => this.startHeartbeat());
  }

  /**
   * Ensure the physical hub pings within 60 seconds (normative is 20).
   * If not, disconnect and start the reconnect interval.
   */
  private startHeartbeat() {
    const heartbeat = () => {
      this.pingExpiry && clearTimeout(this.pingExpiry!);
      this.pingExpiry = setTimeout(() => {
        console.log(`Connection with ${this.hub.identity} dormant... attempting to reconnect.`);
        this.hub.disconnect()
          .then(() => this.reconnect());
      }, 60 * 1000).unref();
    };

    // Guard single Keep-alive for the lifecycle of a connection
    if (this.pingExpiry === undefined) {
      this.wsp.ws.on('ping', heartbeat);
      heartbeat();
    }
  }

  /**
   * Attempt to reconnect every 5 seconds until the connection is
   * re-established at which point the reconnect interval is terminated.
   */
  private reconnect() {
    this.stopHeartbeat();
    let reconnectInProgress = false;
    this.reconnectInterval = setInterval(() => {
      if (!reconnectInProgress && !this.hub.isConnected()) {
        reconnectInProgress = true;
        this.hub.connect()
          .then(() => {
            clearInterval(this.reconnectInterval!);
            console.log(`Reconnected to ${this.hub.identity}`);
          })
          .catch((err) => {
            reconnectInProgress = false;
            console.log(`Reconnect attempt failed due to ${err} - will retry`);
          });
      }
    }, 5 * 1000);
  }

  private stopHeartbeat() {
    clearInterval(this.pingExpiry!);
    this.pingExpiry = undefined;
  }
}