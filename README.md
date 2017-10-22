# matrix-bridge-utils

Bridge utilities.

# ⚠️ Use at your own risk ⚠️

These scripts are lightly tested and can cause serious damage to your homeserver. Use them at your own risk.

# Requirements

* A homeserver
* NodeJS 6.11.0 or higher
* A bridge to administer.

# Usage

1. `git clone https://github.com/turt2live/matrix-bridge-utils`
2. `cd matrix-bridge-utils`
3. `npm install`
4. `node scripts/the_script_to_run.js -h`

# Scripts

* `vacate-room.js` - Forces the bridge, and all of the ghosts, to leave a room
* `send-message.js` - Sends a message as a bridged user to someone else. Creates a new room in the process.