# Ezlo-Hub-Kit

![Continuous Integration](https://github.com/bblacey/ezlo-hub-kit/workflows/Continuous%20Integration/badge.svg)![Publish NPM Package](https://github.com/bblacey/ezlo-hub-kit/workflows/Publish%20NPM%20Package/badge.svg)

## Overview

Ezlo-Hub-Kit is a [Node.js Package Manager](https://www.npmjs.com) module that provides a convenient, fully-typed, SDK for Ezlo Innovation's automation hubs. The kit enables applications to discover local hubs, connect to them securely, retrieve properties such as devices and rooms, observe hub events and perform hub actions.

## Motivation
Ezlo Innovation offers a comprehensive [API](https://api.ezlo.com) for their automation hub products running both the Ezlo Linux (e.g Ezlo Plus, Ezlo Secure) and Ezlo RTOS (e.g. Atom, PlugHub) firmware (bravo!).  However, in order to develop an off-hub App using the stock Ezlo API, application developers are required to write a lot of low-level code simply to discover hubs, establish an authenticated connection, craft and send JSON RPC request objects and interpret the responses, keep connections alive, etc.

The motivation behind Ezlo-Hub-Kit is to enable developers to more rapidly develop off-hub applications with much less code by wrapping the low-level Ezlo APIs into higher level abstractions packaged into a convenient kit published as an npm module.

## Installation
Following broad conventions, the `ezlo-hub-kit` npm module is published as an unscoped public package for convenient access to applications.  This should not create confusion or conflict with any current or future Ezlo APIs and/or SDKs, if any, because Ezlo-developed packages will most likely be published under an Ezlo organization scope.
```zsh
npm install ezlo-hub-kit --save
```

`ezlo-hub-kit` is a hybrid npm module that supports both commonJS and ESM modules with complete Typescript type definitions.

<span style="color:grey">*ESM*</span></p>
```ts
import { EzloHub, EzloCloudResolver } from 'ezlo-hub-kit';
```

<span style="color:grey">*commonJS*</span>
```js
const { EzloHub, EzloCloudResolver } = require('ezlo-hub-kit');
```

## Usage

### Primary SDK Entities
`EzloHub` is a software bridge to a physical Ezlo Innovation hub on the local area network that uses a `CredentialsResolver` to retrieve a hub's `HubCredentials` authentication credentials.

### Hub Authentication Credentials
`EzloHub` communicates with local hubs over authenticated secure websocket connections. An encrypted user id and token, specific to a given hub, are required to estalish the secure connection. A `CredentialsResolver` provides the authentication credentials for a specific hub represented as a `HubCredentials` object.  Currently there are two `CredentialsResolver`s that cover the normative application credential strategies but can easily be extended to include additional resolvers for application-specific credential strategies.

#### EzloCloudResolver (recommended)
The `EzloCloudResolver` retrieves the registered hubs and the associated user-id/authentication-token pairs from the MIOS/Ezlo Cloud.  An `EzloCloudResolver` minimizes Cloud interactions by caching multiple levels of authentication credentials until they expire. The cache exists during the lifecycle of an `EzloCloudResolver`.

```js
const { EzloCloudResolver } = require('ezlo-hub-kit');
credentialsResolver = new EzloCloudResolver('<MIOS username>', '<MIOS password>');
```

#### ConfigFileResolver (useful when Cloud access is not available or desirable)
The `ConfigFileResolver` provides the hub authentication credentials from a local JSON configuration JSON.  This is particularly useful when Ezlo Cloud access is not available or desirable.  For example, when running unit tests, it might be desirable to reduce test iteration time by using a local credentials file.

```js
const { ConfigFileResolver } = require('ezlo-hub-kit');
credentialsResolver = new ConfigFileResolver('configFilePath');
```

### Hub Instantiation
Two SDK methods exist to create `EzloHub` instances directly, the `EzloHub.createHub()` factory method and the `EzloHub` designated constructor. Applications should rarely, if ever, need to call the `EzloHub` designated constructor and are encouraged to use the SDK's higher-level methods.  For example, the `CredentialsResolver` employed by the `createHub()` factory method shields applications from the complexity assoicated with accessing a hub's authentication credentials and/or constructing a hub's `wss://` url.

##### Factory method (recommended)
```js
const { EzloHub, EzloCloudResolver } = require('ezlo-hub-kit');

const credentialsResolver = new EzloCloudResolver('bblacey', '<password>');
const hub = EzloHub.createHub('90000330', credentialsResolver);
```

##### Designated contructor
The designated constructor call site is `constructor(public url: string, private credentials: HubCredentials)`. An application must provide the hub's `wss://<ip address:port>` url and the hub's user credentials represented as an `HubCredentials` object. Use of this method is discouraged in favor of `EzloHub.createHub()` above and is documented here purely for completeness.
```js
const { EzloHub, HubCredentials } = require('ezlo-hub-kit');

const credentials = new HubCredentials('<hub id>', '<user>', '<token>');
const hub = new EzloHub('wss://<hub ip>:17000', credentials);
```

### Hub Discovery
Ezlo-Hub-Kit provides a simple method to discover the Ezlo Hubs advertized on the local network segment.  By default, discovery continues for the duration of the application instance but an application may pass an optional duration timeout to limit the discovery interval.
```js
const { discoverEzloHubs } = require('ezlo-hub-kit');

discoverEzloHubs(credentialsResolver, (hub) => {
	console.log('Discovered Hub: %s', hub.serial);
}, 10000); // Search for 10 seconds
```
It is useful to note, that the collection of hubs known by a `CredentialsResolver` may be different than the hubs discoverable on the local network segment.  For example, one or more hubs may be offline, yet registered with your Ezlo account or configured in a local credentials file. `CrededentialsResolver` provides a method to retrieve the known hub collection when needed.
```js
const { EzloCloudResolver } = require('ezlo-hub-kit');

hubs = await new EzloCloudResolver("bblacey", <password>).hubs();
console.log("Hubs Registered with Ezlo Cloud: %s", hubs)
```

### Hub Connection
Ezlo-Hub-Kit uses an authenticated connection over secure websockets to communicate with a physical hub and provides a `connect()` method to establish the authenticated secure connection with a hub.

```js
// Explicitly connect
const myHub = EzloHub.createHub('90000330', credentialsResolver)
                     .then((hub) => hub.connect();
```
In addition, as a convenience, if the App requests a hub property without first connecting explicitly, Ezlo-Hub-Kit will automatically connect to the hub.
```js
// Implicitly connect by requesting a hub property
const info = EzloHub.createHub('90000330', credentialsResolver)
                    .then((hub) => hub.info()); //Automatically connects
```
#### Keep-Alive
When an `EzloHub` establishes a local authenticated secure-websocket connection with the physical EzloHub, it initiates a best-effort keep-alive strategy to maintain the connection across faults (e.g. hub reboot, stale websocket, etc.).  This ensures that `ezlo-hub-kit` powered applications retain an active connection whenever the hub is operable and accessible on the local network.

### Hub Properties
Using an `EzloHub`, applications can retrieve a hub's `info`, `devices`, `items`, `scenes` and `rooms` properties.  The following example retrieves the hub `info` and `devices` for each hub available on the local area network.
```js
const { discoverEzloHubs, EzloCloudResolver } = require('ezlo-hub-kit');

credentialsResolver = new EzloCloudResolver("bblacey", "password");

discoverEzloHubs(credentialsResolver, async (hub) => {
	// Get the hub's Info
	const info = await hub.info();
	console.log('Discovered Hub %s, architecture: %s, firmware: %s', hub.serial, info.architecture, info.firmware);

	// Get the hub's devices
	for (const device of await hub.devices()) {
		console.log('Device: %s>%s, %s', hub.serial, device.name, device.id);
	}
});
```
#### Hub Property objects are opaque
The hub properties are intentionally the same opaque objects that the [Ezlo JSON-RPC API](https://api.ezlo.com) returns in the result object because this design choice ensures Ezlo-Hub-Kit resilence to changes that Ezlo will introduce until their API stabilizes.  Once the Ezlo JSON RPC API stabilizes, a future `ezlo-api-kit` revision may wrap the typeless opaque API types in well-typed object.

#### Consistent Hub Property accessor pattern
Ezlo-Hub-Kit uses a plurality/signularity pattern for property accessors whenever it is semantically sensible.  Scenes, rooms, devices, modes, and items provide two methods.  The plural form returns all the scenes, rooms, etc. whereas the singular form accepts a tag argument that filters the results (currently limted to exact name match).  This enables applications to locate hub properties by tag and then perform an action with the property `._id` required to perform the action.

```js
// Retrieve all scenes on the hub
const scenes = await hub.scenes();
// Retrieve the scene named 'Return' and run it
const scene = await hub.scene('Return').then((scene) => hub.runScene(scene._id));
// Find all 'switch' items for all devices
const switches = await hub.item('switch');
```

### Hub Actions
`EzloHub` exposes simple actions to change house modes, run scenes and control devices paired with the hub.  In the case of the later, if the application provides a list of items, then EzloHub will use multicast to broadcast the command.
```js
// Set houseMode to 'Away'
hub.houseMode('Away').then((mode) => hub.setHouseMode(mode._id));

// Run the scene named 'Return'
hub.scene('Return').then((scene) => hub.runScene(scene._id));

// Turn off a light - 5fd39c49129ded1201c7e122 is the switch item for the light device
hub.setItemValue('5fd39c49129ded1201c7e122', false);

// Dim 2 lights to 50% - the command will be multicast to both lamp items simultaneously
hub.setItemValue(['5fd39c49129ded1201c7e11f', '5fcd3955129de111fc6e97fe'], 50);

// Dim the Foyer Lamp to 50%
hub.devices('Foyer Lamp') // Get Foyer Lamp Device
.then(device => {
  hub.items('dimmer', device._id) // Git Foyer Lamp 'dimmer' item
    .then(item => hub.setItemValue(item, 50)); // Set the dimmer item to 50%
});
```
Ezlo-Hub-Kit anticipates common idioms for certain long-running actions such as changing House Mode or running a scene, and returns a promise that only resolves once the hub has acknowledged that the action was successful.  This behavior enables apps to conveniently wait to initiate additional actions until the hub completes the current action to avoid "piling on" a large number of requests. In the case of House Modes, Ezlo Hubs default to waiting 30 seconds to switch to a mode other than Home.  If an App needs to wait until a House Mode completes before taking some action like running a scene, it is as simple as the following:
```js
// Change the house mode to 'Away' waiting for the hub to complete the mode change
await hub.houseMode('Away').then(modeId => hub.setHouseMode(modeId));

// Now run the 'Leave' scene
hub.scene('Leave')
.then(scene => hub.runScene(scene.id)
  .then(console.log('Leave scene finished'))
);
```
Behind the scenes, Ezlo-Hub-Kit asynchronously waits for the physical hub to send a `ui_broadcast` message signaling that the mode change or scene execution is complete and, at that point, the SDK resolves the promise returned from `setHouseMode()` so the App can continue issuing actions.  Apps are encouraged to leverage these "intelligent" promises because they include logic that encompasses changing the mode only if the hub is in a different mode, timing out if the hub doesn't respond during the required interval, etc.  However apps are free to bypass this convenience and register their own action completion observers and use a "fire and forget" action approach (see House Mode example in next section).

### Hub Event Observers
Appications can register observers for events broadcast by `EzloHub`.  This provides an efficient mechanism to instantly act upon events of interest (e.g. update the UI whan an item changes state).  For example, `ezlo-homebridge` registers item observers for each HomeKit Accessory Characteristic to accurately and efficiently propogate Ezlo Hub device state changes (e.g. dimmer level) to the bridged HomeKit Accessory.
```js
// Observe all ui messages for a given hub
hub.addObserver((msg) => msg.id === 'ui_broadcast', (msg) => {
  console.log('%s %s:ui_broadcast %o\n', (new Date().toUTCString()), hub.identity, msg);
});
```
As a convenience, several observation predicates are pre-defined for common message filter predicates. For example the snippet above can be re-written to use a pre-defined predicate.
```js
hub.addObserver(UIBroadcastPredicate, (msg) => {
  console.log('%s %s:ui_broadcast %o\n', (new Date().toUTCString()), hub.identity, msg);
});
```
Referring back to the House Mode change example above, the following snippet demonstrates how an App client can "fire and forget" and then take an additional action upon a mode change.
```js
// Register a House Mode Change observer
hub.addObserver(UIBroadcastHouseModeChangeDonePredicate, (msg) => {
  console.log(`The House Mode just changed from ${msg.result.from} to ${msg.result.to}`);
  hub.removeObserver(modeObserver);
});
// The observer above will be called once the hub completes the house mode change
hub.setHouseMode('1');
```
Apps can also extend pre-definied observer filter predicates using an expresssion. For example, to limit the aforementioned observer to only fire when the House Mode changes to Home.
```js
// Register a House Mode change observer for 'Home' mode
hub.addObserver(UIBroadcastHouseModeChangeDonePredicate && msg.result.to === '1'), (msg) => {
  console.log('The House Mode just changed to "Home"');
}
```
### Example

#### MQTT Relay
Relay `ui_broadcast` event messages from all local hubs to an MQTT broker under the topic `/Ezlo/<Hub Identifier>/<sub_message>/<device id>`

```js
const miosUser = '<mios portal user id>';
const miosPassword = '<mios portal password>';
const mqttBrokerUrl = 'mqtt://<ip address>'

const mqtt = require('mqtt');
const { EzloCloudResolver, discoverEzloHubs, UIBroadcastPredicate } = require('ezlo-hub-kit');

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
    hub.addObserver( UIBroadcastPredicate, (msg) => {
        console.log('%s %s:ui_broadcast %o\n', (new Date().toUTCString()), hub.identity, msg);
        client.publish(`Ezlo/${hub.identity}/${msg.msg_subclass}/${msg.result.deviceId}`, JSON.stringify(msg));
    });
});
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

If you are interested in a dockerized version of the MQTT Relay, head over to the [Ez-MQTTRelay](https://github.com/bblacey/ez-mqttrelay) GitHub repository.

### Sample Applications
There are three EZ (Easy) Apps available that illustrate how to use Ezlo-Hub-Kit within an App.  In the spirit of Easy, each EZ-Apps is packaged as docker image so it is easy to try out.

1. [Easy HouseMode-Synchronizer](https://github.com/bblacey/ezlo-housemode-synchronizer)

Easy HouseMode-Synchronizer propagates Vera House Mode Changes to Ezlo hubs on the local area network. The EZ-App illustrates how to use Ezlo-Hub-Kit to discover hubs and change House Modes and how to wait for the hub to complete the mode change.  Users who are transitioning from Vera to Ezlo may find this App useful because House Mode changes initiated on Vera will be propagated to every Ezlo Hub on the LAN.

2. [Easy HouseMode-SceneRunner](https://github.com/bblacey/ez-housemode-scenerunner)

Easy HouseMode-SceneRunner runs a scene on an Ezlo Hub immediately after it transitions to a new House Mode.  The EZ-App illustrates how to use Ezlo-Hub-Kit to discover hubs, use observers to asynchronously act on House Mode changes and execute scenes.  This EZ-App will appeal to Vera Users who have grown accustomed to employing scenes triggered by House Mode changes.  As of this writing, Ezlo Hub scenes can not use House Mode changes as a trigger. [EZ-HouseMode-SceneRunner](bblacey/housemode-scenerunner) bridges the this transtion gap until solutions like [Ezlo's Meshene](https://community.getvera.com/t/until-we-linux/213748/4?u=blacey) and/or [Reactor Multi System](https://community.getvera.com/t/preview-of-multi-system-reactor/216320?u=blacey) become available.

3. [Easy MQTT-Relay](https://github.com/bblacey/ez-mqttrelay)

Easy MQTT-Relay publishes all [ui_broadcast](https://api.ezlo.com/hub/broadcasts/index.html) messages from Ezlo hubs discovered on the local area network to an MQTT broker.   This EZ-App illustrates how to discover hubs, register observation handlers and publish to MQTT.  This should appeal to Ezlo users who would like to push Ezlo controller/hub data to a time-series database (e.g. InfluxDB) for graphical reporting and analysis (e.g. Grafana).

The ReadMe for each EZ-App provides the necessary details.

### Additional Information
Application developers are encouraged to review the [Kit Test Suite](test) and in-line documentation.

---
### Contributors Welcome!

Ezlo-Hub-Kit is an open source work-in-progress to enable other developers to easily implement an off-app hub without having to reinvent the wheel so to speak.  Other developers are encouraged to leverage Ezlo-Hub-Kit for their own off-hub apps to help flesh out and improve the kit (i.e. fork and submit pull requests).  If you are interested in contributing, please review the [Contributing document](https://github.com/bblacey/ezlo-hub-kit/blob/main/Contributing.md).
