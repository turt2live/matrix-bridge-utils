const cmdLineArgs = require("command-line-args");
const cmdLineUsage = require("command-line-usage");
const jsYaml = require("js-yaml");
const fs = require("fs");
const AppServiceRegistration = require("matrix-appservice-bridge").AppServiceRegistration;
const ClientFactory = require("matrix-appservice-bridge").ClientFactory;
const Promise = require("bluebird");

const optionDefinitions = [
    {
        name: "help",
        alias: "h",
        type: Boolean,
        description: "Display this menu",
    },
    {
        name: "registration",
        alias: "r",
        type: String,
        description: "The appservice registration file to read",
        typeLabel: "<appservice-whatever.yaml>",
    },
    {
        name: "domain",
        alias: "d",
        type: String,
        description: "The domain that suffixes all IDs.",
        typeLabel: "<domain.com>",
    },
    {
        name: "csapi",
        alias: "a",
        type: String,
        description: "The base URL to use for client/server API interaction. Default: http://localhost:8008",
        defaultValue: "http://localhost:8008",
        typeLabel: "<http://localhost:8008>",
    },
    {
        name: "user",
        alias: "u",
        type: String,
        description: "The user to impersonate",
        typeLabel: "<@_bridged_user:domain.com>",
    },
    {
        name: "target",
        alias: "t",
        type: String,
        description: "The user to target",
        typeLabel: "<@someone:domain.com>",
    },
    {
        name: "message",
        alias: "m",
        type: String,
        description: "The message to send",
        typeLabel: "<words go here>",
    },
];

const options = cmdLineArgs(optionDefinitions);

if (options.help) {
    console.log(cmdLineUsage([
        {
            header: "Vacate Room",
            content: "Forces the bridge to leave the room, including all of its ghosts",
        },
        {
            header: "Options",
            optionList: optionDefinitions,
        },
    ]));
    process.exit(0);
}

if (!options.registration || !options.user || !options.domain || !options.target || !options.message) {
    console.log("Missing registration, domain, user, target, or message. Please see -h");
    process.exit(1);
}

// Try parsing the configuration to get a better picture of the state of things
const appserviceConfig = jsYaml.safeLoad(fs.readFileSync(options.registration), 'utf8');
const registration = AppServiceRegistration.fromObject(appserviceConfig);

const factory = new ClientFactory({
    appServiceUserId: "@" + registration.sender_localpart + ":" + options.domain,
    token: registration.as_token,
    url: options.csapi
});
const client = factory.getClientAs(options.user);

console.log("Creating new room for message...");
let roomId = null;
client.createRoom({
    visibility: 'private',
    invite: [options.target],
    preset: 'trusted_private_chat',
}).then(roomInfo => {
    roomId = roomInfo.room_id;
}).then(() => {
    console.log("Waiting for target user to join...");
    return waitForUserToJoin(client, options.target, roomId);
}).then(() => {
    console.log("Sending message...");
    return client.sendMessage(roomId, {msgtype: "m.text", body: options.message});
}).then(event => {
    console.log("Message sent as event " + event.event_id + " in room " + roomId);
});

function waitForUserToJoin(client, userId, roomId) {
    return new Promise((resolve, reject) => {
        const fn = () => isMemberInRoom(client, userId, roomId);
        const wrapper = (result) => !result ? fn().then(wrapper) : resolve();
        wrapper(false);
    });
}

function isMemberInRoom(client, userId, roomId) {
    return client._http.authedRequestWithPrefix(undefined, "GET", "/rooms/" + encodeURIComponent(roomId) + "/joined_members", undefined, undefined, "/_matrix/client/r0").then(response => {
        let userIds = [];
        if (response.joined) userIds = Object.keys(response.joined);

        return userIds.indexOf(userId) !== -1;
    });
}