# ezlo-hub-kit

## Overview

`ezlo-hub-kit` is a [Node Package Manager](https://www.npmjs.com) module that provides a convenient, fully-typed, SDK for Ezlo Innovation's automation hubs. The kit enables applications to discover local hubs, connect to them securely, retrieve properties such as devices and rooms, observe hub events and perform hub actions.

## Motivation
Ezlo Innovation offers a comprehensive [API](https://api.ezlo.com) for their automation hub products running both the Ezlo Linux (e.g Ezlo Plus, Ezlo Secure) and Ezlo RTOS (e.g. Atom, PlugHub) firmware (bravo!).  However, in order to develop an off-hub App using the stock Ezlo API, application developers are required to write a lot of low-level code just to discover hubs, establish an authenticated connection, craft and send JSON RPC request objects and interpret the responses, etc.

The motivation behind `ezlo-hub-kit` is to enable developers to more rapidly develop off-hub applications with much less code by wrapping the low-level Ezlo APIs into higher level abstractions packaged into a convenient kit published as npm module.

## Installation
The `ezlo-hub-kit` npm module is published under the `@bblacey` namespace to prevent confusion or conflict with any current or future Ezlo APIs and/or SDKs hence, application dependencies must reference the scoped package.
```zsh
npm install @bblacey/ezlo-hub-kit --save
```

`ezlo-hub-kit` is a hybrid npm module that supports both commonJS and ESM modules with complete Typescript types.  For example,

<span style="color:grey">*esm*</span></p>
```ts
import { EzloHub, EzloCloudResolver } from '@bblacey/ezlo-hub-kit';
```

<span style="color:grey">*commonJS*</span>
```js
const { EzloHub, EzloCloudResolver } = require('@bblacey/ezlo-hub-kit');
```

## Usage

### Primary SDK Entities
`EzloHub` is a software bridge to a physical Ezlo Innovation hub on the local area network that uses a `CredentialsResolver` to retrieve a hub's `HubCredentials` authentication credentials.

### Hub Authentication Credentials
`EzloHub` communicates with local hubs over authenticated secure websocket connections. An encrypted user id and token, specific to a given hub, are required to estalish the secure connection. A `CredentialsResolver` provides the authentication credentials for a specific hub represented as a `HubCredentials` object.  Currently there are two `CredentialsResolver`s that cover the normative application credential strategies but can easily be extended to include additional resolvers for specific requirements (i.e. an application-specific configuration scheme).

#### EzloCloudResolver (recommended)
The `EzloCloudResolver` retrieves the registered hubs and the associated user-id/authentication-token pairs from the MIOS/Ezlo Cloud.  An `EzloCloudResolver` minimizes Cloud interactions by caching multiple levels of authentication credentials until they expire. The cache exists during the lifecycle of an `EzloCloudResolver`.

```js
const { EzloCloudResolver } = require('@bblacey/ezlo-hub-kit');
credentialsResolver = new EzloCloudResolver('<MIOS username>', '<MIOS password>');
```

#### ConfigFileResolver (useful when Cloud access is not available or desirable)
The `ConfigFileResolver` provides the hub authentication credentials from a local configuration JSON file.  This is particularly useful when Ezlo Cloud access is not available or desirable.  For example, when running unit tests, it might be desirable to reduce test iteration time by using a local credentials file.

```js
const { ConfigFileResolver } = require('@bblacey/ezlo-hub-kit');
credentialsResolver = new ConfigFileResolver('configFilePath');
```

### Hub Instantiation
Two SDK methods exist to create `EzloHub` instances directly, the `EzloHub.createHub()` factory method and the `EzloHub` designated constructor. Applications should rarely, if ever, need to call the `EzloHub` designated constructor and are encouraged to use the SDK's higher-level methods.  For example, the `CredentialsResolver` employed by the `createHub()` factory method shields applications from the complexity assoicated with accessing a hub's authentication credentials and/or constructing a hub's `wss://` url.

##### Factory method (recommended)
```js
const { EzloHub, EzloCloudResolver } = require('@bblacey/ezlo-hub-kit');

const credentialsResolver = new EzloCloudResolver('bblacey', '<password>');
const hub = EzloHub.createHub('90000330', credentialsResolver);
```

##### Designated contructor
The designated constructor call site is `constructor(public url: string, private credentials: HubCredentials)` where at the most complex level, the application must provide the hub's `wss://<ip address:port>` url the hub's user credentials represented as an `HubCredentials` object. Use of this method is discouraged in favor of `EzloHub.createHub()` above and is documented here purely for completeness.
```js
const { EzloHub, HubCredentials } = require('@bblacey/ezlo-hub-kit');

const credentials = new HubCredentials('<hub id>', '<user>', '<token>');
const hub = new EzloHub('wss://<hub ip>:17000', credentials);
```

### Hub Discovery
There is a simple method to discover the Ezlo Hubs advertized on the local network segment.  By default, discovery continues for the duration of the application instance but an application may pass an optional duration timeout to limit the discovery interval.
```js
const { discoverEzloHubs } = require('@bblacey/ezlo-hub-kit');

discoverEzloHubs(credentialsResolver, (hub) => {
	console.log('Discovered Hub: %s', hub.serial);
}, 10000);
```
It is useful to note, that the collection of hubs known by a `CredentialsResolver` may be different than the hubs discoverable on the local network segment.  For example, one or more hubs may be offline, yet registered with your Ezlo account or configured in a local credentials file. `CrededentialsResolver` provides a method to retrieve the known hub collection when needed.
```js
const { EzloCloudResolver } = require('@bblacey/ezlo-hub-kit');

hubs = await new EzloCloudResolver("bblacey", <password>).hubs();
console.log("Hubs Registered with Ezlo Cloud: %s", hubs)
```

### Hub Connection
The SDK uses an authenticated connection over secure websockets to communicate with a physical hub.  The SDK provides a `connect()` method to establish an authenticated secure connection with a hub. In addition, as a convenience, if the App requests a hub property without first connecting explicitly, the SDK will automatically connect to the hub.

```js
// Explicitly connect
const myHub = EzloHub.createHub('90000330', credentialsResolver)
                .then((hub) => hub.connect();
```

```js
// Implicitly connect by requesting a hub property
const info = EzloHub.createHub('90000330', credentialsResolver)
               .then((hub) => hub.info()); //Automatically connects
```

#### Keep-Alive
When an `EzloHub` establishes a local authenticated secure-websocket connection with the physical EzloHub, it initiates a best-effort keep-alive strategy to maintain the connection across faults (e.g. hub reboot, stale websocket, etc.).  This ensures that `ezlo-hub-kit` applications retain an active connection whenever the hub is operable and accessible on the local network.

### Hub Properties
Using an `EzloHub`, applications can retrieve a hub's `info`, `devices`, `items`, `scenes` and `rooms` properties.  The following example retrieves the hub `info` and `devices` for each hub available on the local area network.
```js
const { discoverEzloHubs, EzloCloudResolver } = require('@bblacey/ezlo-hub-kit');

credentialsResolver = new EzloCloudResolver("bblacey", "password");

discoverEzloHubs(credentialsResolver, async (hub) => {
	// Get the hub's Info
	const info = await hub.info();
	console.log('Discovered Hub %s, architecture: %s, firmware: %s', hub.serial, info.architecture, info.firmware);

	// Get the hub's devices
	for (const device of await hub.devices()) {
		console.log('Device: %s>%s, %s', hub.serial, device.id, device.name);
	}
});
```
The hub properties are opaque objects from the result returned by the [Ezlo API JSON-RPC](https://api.ezlo.com) request.  A future `ezlo-api-kit` revision may wrap the typeless opaque API types in well-typed objects.

### Hub Actions
`EzloHub` exposes simple actions to change house modes, run scenes and control devices paired with the hub.  In the case of the later, if the application provides a list of items, then EzloHub will multicast the command.
```js
const hub = new EzloHub('90000777', credentialsResolver);
// Set houseMode to 'Away'
hub.houseMode('Away').then((modeId) => hub.setHouseMode(modeId));
// Run the scene named 'Return'
hub.scene('Return').then((sceneId) => hub.runScene(sceneId));
// Turn off a light - 5fd39c49129ded1201c7e122 is the switch item for the light device
hub.setItemValue('5fd39c49129ded1201c7e122', false);
// Dim 2 lights to 50% - the command will be multicast to both lamp items simultaneously
hub.setItemValue(['5fd39c49129ded1201c7e11f', '5fcd3955129de111fc6e97fe'], 50);
```

### Hub Event Observation
Appications can register observers for events broadcast by `EzloHub`.  This provides an efficient mechanism to instantly act upon events of interest (e.g. update the UI for an item).  For example, `ezlo-homebridge` registers item observers for each HomeKit Accessory Characteristic to accurately and efficiently propogate Ezlo Hub device state changes (e.g. dimmer level) to the bridged HomeKit Accessory.
```js
// Observe all ui messages for a given hub
hub.addObserver((msg) => msg['id'] === 'ui_broadcast', (msg) => {
    console.log('%s %s:ui_broadcast %o\n', (new Date().toUTCString()), hub.identity, msg);
});
```
### Examples

#### MQTT Relay
Relay `ui_broadcast` event messages from all local hubs to an MQTT broker under the topic `/Ezlo/<Hub Identifier>/<sub_message>/<device id>`

```js
const miosUser = '<mios portal user id>';
const miosPassword = '<mios portal password>';
const mqttBrokerUrl = 'mqtt://<ip address>'

const mqtt = require('mqtt');
const { EzloCloudResolver, discoverEzloHubs, UIBroadcastMessagePredicate } = require('@bblacey/ezlo-hub-kit');

function main() {

    // Connect to the MQTT broker
    const client  = mqtt.connect(mqttBrokerUrl)
    client.on('connect', () => console.log('connected to mqtt broker'));

    // Discover all local Ezlo Hubs
    discoverEzloHubs(new EzloCloudResolver(miosUser, miosPassword), async (hub) => {

        // Report the information about the discovered hub (implicitly connects)
        const info = await hub.info();
        console.log('Observing: %s, architecture: %s\t, model: %s\t, firmware: %s, uptime: %s',
                     info.serial, info.architecture, info.model, info.firmware, info.uptime);

        // Register to receive the ui_broadcast messages from this hub and publish to MQTT broker
        hub.addObserver( UIBroadcastMessagePredicate, (msg) => {
            console.log('%s %s:ui_broadcast %o\n', (new Date().toUTCString()), hub.identity, msg);
            client.publish(`Ezlo/${hub.identity}/${msg.msg_subclass}/${msg.result.deviceId}`, JSON.stringify(msg));
        });
    });

}

main();
```

##### Sample output
###### Launch MQTT Relay
```zsh
$ node index.js

connected to mqtt broker
Observing: 45006642, architecture: mips , model: g150   , firmware: 2.0.5.1213.2, uptime: 3d 3h 45m 20s
Observing: 90000330, architecture: armv7l       , model: h2.1   , firmware: 2.0.6.1271.3, uptime: 3d 4h 0m 23s
Observing: 90000369, architecture: armv7l       , model: h2.1   , firmware: 2.0.6.1271.3, uptime: 4d 22h 20m 26s
Observing: 70060017, architecture: esp32        , model: ATOM32 , firmware: 0.8.528, uptime: 3d 3h 11m 3s
Observing: 70060095, architecture: esp32        , model: ATOM32 , firmware: 0.8.528, uptime: 0d 5h 10m 43s
Sat, 09 Jan 2021 16:32:49 GMT 70060095:ui_broadcast {
  id: 'ui_broadcast',
  msg_subclass: 'hub.item.updated',
  msg_id: 3025550422,
  result: {
    _id: 'E2689956',
    deviceId: 'ZC0E40D34',
    deviceName: 'Boardwalk',
    deviceCategory: 'dimmable_light',
    deviceSubcategory: 'dimmable_colored',
    serviceNotification: false,
    roomName: 'Exterior',
    userNotification: true,
    notifications: null,
    name: 'switch',
    valueType: 'bool',
    value: false,
    syncNotification: false
  }
}
```
###### mosquitto_sub (message receive by broker on topic /Ezlo/#)
```zsh
$ mosquitto_sub -h <broker> -t 'Ezlo/#' -v
Ezlo/70060095/hub.item.updated/ZA63A835 {"id":"ui_broadcast","msg_subclass":"hub.item.updated","msg_id":3025550429,"result":{"_id":"A95EC7DB","deviceId":"ZA63A835","deviceName":"Corner Garden","deviceCategory":"dimmable_light","deviceSubcategory":"dimmable_colored","serviceNotification":false,"roomName":"Exterior","userNotification":true,"notifications":null,"name":"switch","valueType":"bool","value":true,"syncNotification":false}}
```

If you are interested in a dockerized version of the MQTT Relay, head over to the [Ezlo-MQTTRelay](https://github.com/bblacey/ezlo-mqttrelay) GitHub repository.

#### Synchronize House Mode between Vera and all local Ezlo Hubs


---
### Additional Information
Application developers are encouraged to review the [Kit Test Suite](test) and in-line documentation.