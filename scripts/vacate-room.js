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
        name: "userprefix",
        alias: "u",
        type: String,
        description: "The user prefix to group on. Required if the script cannot determine what the prefix is.",
        typeLabel: "<@_bridged>",
    },
    {
        name: "roomId",
        alias: "i",
        type: String,
        description: "The room ID to vacate",
        typeLabel: "<!someroom:domain.com>",
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

if (!options.registration || !options.roomId || !options.domain) {
    console.log("Missing registration, domain, or roomId. Please see -h");
    process.exit(1);
}

// Try parsing the configuration to get a better picture of the state of things
const appserviceConfig = jsYaml.safeLoad(fs.readFileSync(options.registration), 'utf8');
const registration = AppServiceRegistration.fromObject(appserviceConfig);

let usersPrefix = options.usersprefix;
if (!usersPrefix) {
    if (registration.namespaces && registration.namespaces.users && registration.namespaces.users.length > 0) {
        let regex = registration.namespaces.users[0].regex;
        if (regex.endsWith(".*")) usersPrefix = regex.substring(0, regex.length - 2);
        else throw new Error("Cannot determine prefix for users: Unrecognized regex");
    } else throw new Error("Cannot determine prefix for users: Missing configuration in registration");
}

const factory = new ClientFactory({
    appServiceUserId: "@" + registration.sender_localpart + ":" + options.domain,
    token: registration.as_token,
    url: options.csapi
});
const botClient = factory.getClientAs(null);

console.log("Finding bridged users in room...");
botClient._http.authedRequestWithPrefix(undefined, "GET", "/rooms/" + encodeURIComponent(options.roomId) + "/joined_members", undefined, undefined, "/_matrix/client/r0").then(response => {
    let userIds = [];
    if (response.joined) userIds = Object.keys(response.joined);

    let bridgedUserIds = userIds.filter(u => u.startsWith(usersPrefix));
    console.log("Found " + bridgedUserIds.length + " bridged users in room " + options.roomId);

    return bridgedUserIds;
}).then(userIds => {
    let chain = Promise.resolve();
    userIds.map(u => chain = chain.then(() => leaveRoom(factory, u, options.roomId)));
    return chain;
}).then(() => {
    console.log("Done!");
});

function leaveRoom(clientFactory, userId, roomId) {
    console.log("Forcing " + userId + " to leave " + roomId);
    const client = clientFactory.getClientAs(userId);
    return client.leave(roomId);
}