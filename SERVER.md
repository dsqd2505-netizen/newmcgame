# 🎮 Hytale F2P Server Guide

Play with friends online! This guide covers both easy in-game hosting and advanced dedicated server setup.

### **DOWNLOAD SERVER FILES (JAR/RAR/SCRIPTS) HERE: https://discord.gg/hf2pdc** 

**Table of Contents**

* [\[NEW!\] Play Online with Official Accounts 🆕](#new-play-online-with-official-accounts-)
* ["Server" Term and Definition](#server-term-and-definiton)
* [Server Directory Location](#server-directory-location)
* [A. Host Your Singleplayer World](#a-host-your-singleplayer-world)
  * [1. Using Online-Play Feature In-Game Invite Code](#1-using-online-play-feature--in-game-invite-code)
    * [Common Issues (UPnP/NAT/STUN) on Online Play](#common-issues-upnpnatstun-on-online-play)
  * [2. Using Tailscale](#2-using-tailscale)
  * [3. Using Radmin VPN](#3-using-radmin-vpn)
* [B. Local Dedicated Server](#b-local-dedicated-server)
  * [1. Using Playit.gg (Recommended) ✅](#1-using-playitgg-recommended-)
* [C. 24/7 Dedicated Server (Advanced)](#c-247-dedicated-server-advanced)
  * [Step 1: Get the Files Ready](#step-1-get-the-files-ready)
  * [Step 2: Place HytaleServer.jar in the Server directory](#step-2-place-hytaleserverjar-in-the-server-directory)
  * [Step 3: Run the Server](#step-3-run-the-server)
* [D. Tinkering Guides](#d-tinkering-guides)
  * [1. Network Setup](#1-network-setup)
  * [2. Configuration](#2-configuration)
  * [3. RAM Allocation Guide](#3-ram-allocation-guide)
  * [4. Server Commands](#4-server-commands)
  * [5. Command Line Options](#5-command-line-options)
  * [6. File Structure](#6-file-structure)
  * [7. Backups](#7-backups)
  * [8. Troubleshooting](#8-troubleshooting)
  * [9. Docker Deployment (Advanced)](#9-docker-deployment-advanced)
  * [10. Getting Help](#10-getting-help) 
---

<div align='center'>
 <h3>
  <b>
  Do you want to create Hytale Game Server with EASY SETUP, AFFORDABLE PRICE, AND 24/7 SUPPORT?
  </b>
 </h3>
 <h2>
  <b>
  <a href="https://cloudnord.net/hytale-server-hosting">CLOUDNORD</a> is the ANSWER! HF2P Server is available!
  </b>
 </h2>
 
</div>

**CloudNord's Hytale, Minecraft, and Game Hosting** is at the core of our Server Hosting business. Join our Gaming community and experience our large choice of premium game servers, we’ve got you covered with super high-performance hardware, fantastic support options, and powerful server hosting to build and explore your worlds without limits! 

**Order your Hytale, Minecraft, or other game servers today!**
Choose Java Edition, Bedrock Edition, Cross-Play, or any of our additional supported games.
Enjoy **20% OFF** all new game servers, **available now for a limited time!** Don’t miss out.

### **CloudNord key hosting features include:**
- Instant Server Setup ⚡
- High Performance Game Servers 🚀
- Game DDoS Protection 🛡️
- Intelligent Game Backups 🧠
- Quick Modpack Installer 🔧
- Quick Plugin & Mod Installer 🧰
- Full File Access 🗃️
- 24/7 Support 📞 🏪
- Powerful Game Control Server Panel 💪

### **Check Us Out:**
* 👉 CloudNord Website: https://cloudnord.net/hytalef2p
* 👉 CloudNord Discord: https://discord.gg/TYxGrmUz4Y
* 👉 CloudNord Reviews: https://www.trustpilot.com/review/cloudnord.net?page=2&stars=5

--- 

### [NEW!] Play Online with Official Accounts 🆕

**Documentations:**
* [Hytale-Server-Docker by Sanasol](https://github.com/sanasol/hytale-server-docker/tree/main?tab=readme-ov-file#dual-authentication)

**Requirements:**
* Using the patched HytaleServer.jar
* Has Official Account with Purchased status on Official Hytale Website.
* This official account holder can be the server hoster or one of the players.

**Steps:**
1. Running the patched HytaleServer.jar with either [B. Local Dedicated Server](#b-local-dedicated-server) or [C. 24/7 Dedicated Server (Advanced)](#c-247-dedicated-server-advanced) successfully.
2. On the server's console/terminal/CMD, server admin **MUST RUN THIS EACH BOOT** to allow players with Official Hytale game license to connect on the server:
```
/auth logout
/auth persistence Encrypted
/auth login device
```
3. Server console will show instructions, an URL and a code; these will be revoked after 10 minutes if not authorized.
4. The server hoster can open the URL directly to browser by holding Ctrl then Click on it, or copy and send it to the player with official account.
5. Once it authorized, the official accounts can join server with F2P players.
6. If you want to modify anything, look at the [Hytale-Server-Docker](https://github.com/sanasol/hytale-server-docker/) above, give the repo a STAR too.

---

### "Server" Term and Definiton

"HytaleServer.jar", which called as "Server", functions as the place of authentication of the client that supposed to go to Hytale Official Authentication System but we managed our way to redirect it on our service (Thanks to Sanasol), handling approximately thousands of players worldwide to play this game for free.

Kindly support us via [our Buy Me a Coffee link](https://buymeacoffee.com/hf2p) if you think our launcher took a big part of developing this Hytale community for the love of the game itself. 
**We will always advertise, always pushing, and always asking, to every users of this launcher to purchase the original game to help the official development of Hytale**. 

### Server Directory Location

Here are the directory locations of Server folder if you have installed it on default instalation location:
- **Windows:** `%localappdata%\HytaleF2P\release\package\game\latest\Server`
- **macOS:** `~/Library/Application Support/HytaleF2P/release/package/game/latest/Server`
- **Linux:** `~/.hytalef2p/release/package/game/latest/Server`

> [!NOTE]
> This location only exists if the user installed the game using our launcher.
> The `Server` folder needed to auth the HytaleClient to play Hytale in Singleplayer/Multiplayer for now.
> (We planned to add offline mode in later version of our launcher).

> [!IMPORTANT]
> Hosting a dedicated Hytale server will not need the exact similar tree. You can put it anywhere, as long as the directory has `Assets.zip` which
> can be acquired from our launcher via our `HytaleServer.rar` server file (which contains patched `HytaleServer.jar`, `Assets.zip`, and `run_server` scripts in `.sh & .bat`.

---

# A. Host Your Singleplayer World

This feature is perfect for 1-5 players that want to just play instantly with friends.
Terms and conditions applies.

## 1. Using Online-Play Feature / In-Game Invite Code

The easiest way to play with friends - no manual server setup required!

*The game automatically handles networking using UPnP/STUN/NAT traversal.*

**For Online Play to work, you need:**
- **UPnP enabled** on your router (most routers have this on by default)
- **Public IP address** from your ISP (not behind CGNAT)

> [!TIP]
> Hoster need to make sure that the router can use UPnP: read router docs, wiki, or watch Youtube tutorials.
>
> If you encounter any problem, check Common Issues section below!

1. Press **Worlds** on the Main Menu.
2. Select which world you want to play with your friend.
3. Once you get in the world, press **ESC**/Pause the game.
4. Press **Online Play** in the Pause Menu.
5. Set option "Allow Other Players to Join" from OFF to **ON**. You can set Password if you want.
6. Press **Save**, the Invite Code will appear.
7. Press **Copy to Clipboard** and **Share the Invite Code** to your friends!
8. Friends: Press **Servers** in the Main Menu > Press **Join via Code** > Paste the Code > Join.

> [!WARNING]
> If other players can't join the Hoster with error: `Failed to connect to any available address. The host may be offline or behind a strict firewall.`
> 
> **AND ALSO** the Hoster "Online Play" menu shows `Connected to STUN - NAT Type: Restricted (No UPnP)`,
>
> this means the Online Play is **unavailable** on the Hoster machine, and it is neccessary to use services to host your world. **We recommend Playit.gg!**


### Common Issues (UPnP/NAT/STUN) on Online Play
<details><summary><b>a. "NAT Type: Carrier-Grade NAT (CGNAT)" Warning</b></summary>

If you see this message:
```
Connected via UPnP
NAT Type: Carrier-Grade NAT (CGNAT)
Warning: Your network configuration may prevent other players from connecting.
```

**What this means:** Your ISP doesn't give you a public IP address. Multiple customers share one public IP, which blocks incoming connections.

**Solutions:**
1. **Contact your ISP** - Request a public/static IP address (may cost extra)
2. **Use a VPN with port forwarding** - Services like Mullvad, PIA, or AirVPN offer this
3. **Use Playit.gg / Tailscale / Radmin VPN** - Create a virtual LAN with friends (see below)
4. **Have a friend with public IP host instead**
</details>

<details><summary><b>b. "UPnP Failed" or "Port Mapping Failed" Warning</b></summary>
 
**Check your router:**
1. Log into router admin panel (usually `192.168.1.1` or `192.168.0.1`)
2. Find UPnP settings (often under "Advanced" or "NAT")
3. Enable UPnP if disabled
4. Restart your router

**If UPnP isn't available:**
- Manually forward **port 5520 UDP** to your computer's local IP
- See "Port Forwarding" or "Workarounds or NAT/CGNAT" sections below
</details>

<details><summary><b>c. "Connected via STUN", "Strict NAT" or "Symmetric NAT" Warning</b></summary>

Some routers have restrictive NAT that blocks peer connections.

**Try:**
1. Enable "NAT Passthrough" or "NAT Filtering: Open" in router settings
2. Put your device in router's DMZ (temporary test only)
3. Use Playit.gg / Tailscale / Radmin VPN as workaround
</details>

## 2. Using Tailscale

Tailscale creates mesh VPN service that streamlines connecting devices and services securely across different networks. And **works crossplatform!!**

1. All members are required to download [Tailscale](https://tailscale.com/download) on your device.
[Once installed, Tailscale starts and live inside your hidden icon section in Windows, Mac and Linux]
2. Create a **common Tailscale** account which will shared among your friends to log in.
3. Ask your **host to login in to thier Tailscale client first**, then the other members.
  * Host
    * Open your singleplayer world
    * Go to Online Play settings
    * Re-save your settings to generate a new share code
  * Friends
    * Ensure Tailscale is connected
    * Use the new share code to connect
    * To test your connection, ping the host's ipv4 mentioned in Tailscale

## 3. Using Radmin VPN

Creates a virtual LAN - all players need to install it:

1. Download [Radmin VPN](https://www.radmin-vpn.com/) - All players install it
2. One person create a room/network, others join with network name/password
3. Host joined the world, others will connect to it.
4. Open Hytale Game > Servers > Add Servers > Direct Connect > Type IP Address of the Host from Radmin.

These options bypass all NAT/CGNAT issues. But for **Windows machines only!**

---

# B. Local Dedicated Server

This option is perfect for any players size. From small to high.

## 1. Using Playit.gg (Recommended) ✅

Free tunneling service - only the host needs to install it:

1. Go to https://playit.gg/login and **Log In** with your existing account, **Create Account** if you don't have one
2. Press "Add a tunnel" > Select `UDP` > Tunnel description of `Hytale Server` > Port count `1` > and Local Port `5520`
3. Press **Start the tunnel** (or you can just run the Playit.gg.EXE if you already installed it on your machine) - You'll get a public address like `xx-xx.gl.at.ply.gg:5520`
4. Go to https://playit.gg/download : `Installer` (Windows) or `x86-64` (Linux) or follow `Debian Install Script` (Debian-based only) 
   * Windows: Install the `playit-windows.msi`
   * Linux:
     * Right-click file > Properties > Turn on 'Executable as a Program' | or `chmod +x playit-linux-amd64` on terminal
     * Run by double-clicking the file or `./playit-linux-amd64` via terminal
5. Open the URL/link by `Ctrl+Click` it. If unable, select the URL, then Right-Click to Copy (`Ctrl+Shift+C` for Linux) then Paste the URL into your browser to link it with your created account. 
6. Once it done, download the `run_server_with_tokens (1)` script file (`.BAT` for Windows, `.SH` for Linux) from our Discord server > channel `#open-public-server`
7. Put the script file to the `Server` folder in `HytaleF2P` directory (`%localappdata%\HytaleF2P\release\package\game\latest\Server`)
8. Rename the script file to `run_server_with_tokens` to make it easier if you run it with Terminal, then do Method A or B.
9. If you put it in `Server` folder in `HytaleF2P` launcher, change `ASSETS_PATH="${ASSETS_PATH:-./Assets.zip}"` inside the script to be `ASSETS_PATH="${ASSETS_PATH:-../Assets.zip}"`. NOTICE THE `./` and `../` DIFFERENCE.
10. Copy the `Assets.zip` from the `%localappdata%\HytaleF2P\release\package\game\latest\` folder to the `Server\` folder. (TIP: You can use Symlink of that file to reduce disk usage!)
11. Double-click the .BAT file to host your server, wait until it shows:
```
===================================================
Hytale Server Booted! [Multiplayer, Fresh Universe]
===================================================
```
11. Connect to the server by go to `Servers` in your game client, press `Add Server`, type `localhost` in the address box, use any name for your server.
12. Send the public address in Step 3 to your friends.

> [!CAUTION]
> Do not close the Playit.gg Terminal OR HytaleServer Terminal if you are still playing or hosting the server.

## 2. Using Tailscale [DRAFT]

Tailscale

---

# C. 24/7 Dedicated Server (Advanced)

For 24/7 servers, custom configurations, or hosting on a VPS/dedicated machine.

## Step 1: Get the Files Ready

### Prequisites

1. `HytaleServer.jar` (pre-patched for F2P players; dual-auth soon for Official + F2P play)
2. `Assets.zip`
3. `run_scripts_with_token.bat` for Windows or `run_scripts_with_token.sh` for macOS/Linux

> [!NOTE]
> The `HytaleServer.rar` available on our Discord Server (`#open-public-server` channel; typo on the Discord, not `zip`) includes all of the prequisites.
> Unfortunately, the JAR inside the RAR isn't updated so you'll need to download the JAR from the link on Discord.

> [!TIP]
> You can copy `Assets.zip` generated from the launcher to be used for the dedicated server. It's located in `HytaleF2P/release/package/game/latest`. 


## Step 2: Place `HytaleServer.jar` in the `Server` directory

* Windows
  * `%localappdata%\HytaleF2P\release\package\game\latest\Server`
* macOS
  * `~/Library/Application Support/HytaleF2P/release/package/game/latest/Server`
* Linux
  * `~/.hytalef2p/release/package/game/latest/Server`
* If you have a custom install path, the Server folder is inside your custom location under
  * `HytaleF2P/release/package/game/latest/Server`.

## Step 3: Run the Server

**Windows:**
```batch
run_server_with_token.bat
```

**macOS / Linux:**
```bash
./run_server_with_token.sh
```

---

# D. Tinkering Guides

## 1. Network Setup

### a. Local Network (LAN)

If all players are on the same network:
1. Find your local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Share this IP with players on your network
3. Default port is `5520`

### b. Port Forwarding (Internet Play)

To allow direct internet connections:
1. Forward **port 5520 (UDP)** in your router
2. Find your public IP at [whatismyip.com](https://whatismyip.com)
3. Share your public IP with players

**Windows Firewall:**
```powershell
# Run as Administrator
netsh advfirewall firewall add rule name="Hytale Server" dir=in action=allow protocol=UDP localport=5520
```

---

## 2. Configuration

### a. Environment Variables

Write this in the script file `.BAT`/`.SH` or set these manually in command before running to customize your server:

| Variable | Default | Description |
|----------|---------|-------------|
| `HYTALE_AUTH_DOMAIN` | `auth.sanasol.ws` | Auth server domain (4-16 chars) |
| `BIND_ADRESS` | `0.0.0.0:5520` | Server IP and port |
| `AUTH_MODE` | `authenticated` | Auth mode (see below) |
| `SERVER_NAME` | `My Hytale Server` | Server display name |
| `ASSETS_PATH` | `./Assets.zip` | Assets file location |
| `JVM_XMS` | `2G` | Minimum Java memory |
| `JVM_XMX` | `4G` | Maximum Java memory |

**Example (Windows):**
```batch
set SERVER_NAME=My Awesome Server
set JVM_XMX=8G
run_server.bat
```

**Example (Linux/macOS):**
```bash
SERVER_NAME="My Awesome Server" JVM_XMX=8G ./run_server.sh
```

### b. Authentication Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `authenticated` | Players log in via F2P Launcher | Public servers |
| `unauthenticated` | No login required | LAN parties, testing |
| `singleplayer` | Local play only | Solo testing |

---

## 3. RAM Allocation Guide

Adjust memory based on your system:

| System RAM | Players | JVM_XMS | JVM_XMX |
|------------|---------|---------|---------|
| 4 GB | 1-3 | `512M` | `2G` |
| 8 GB | 3-8 | `1G` | `4G` |
| 16 GB | 8-15 | `2G` | `8G` |
| 32 GB | 15+ | `4G` | `12G` |

**Example for large server:**
```bash
JVM_XMS=4G JVM_XMX=12G ./run_server.sh
```

**Tips:**
- `-Xms` = minimum RAM (allocated at startup)
- `-Xmx` = maximum RAM (upper limit)
- Never allocate all your system RAM - leave room for OS
- Start conservative and increase if needed

---

## 4. Server Commands

Once running, use these commands in the console:

| Command | Description |
|---------|-------------|
| `help` | Show all commands |
| `stop` | Stop server gracefully |
| `save` | Force world save |
| `list` | List online players |
| `op <player>` | Give operator status |
| `deop <player>` | Remove operator status |
| `kick <player>` | Kick a player |
| `ban <player>` | Ban a player |
| `unban <player>` | Unban a player |
| `tp <player> <x> <y> <z>` | Teleport player |


Use `/` slash for these commands.

---

## 5. Command Line Options

Pass these when starting the server:

```bash
./run_server.sh [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--bind <ip:port>` | Server address (default: 0.0.0.0:5520) |
| `--auth-mode <mode>` | Authentication mode |
| `--universe <path>` | Path to world data |
| `--mods <path>` | Path to mods folder |
| `--backup` | Enable automatic backups |
| `--backup-dir <path>` | Backup directory |
| `--backup-frequency <mins>` | Backup interval |
| `--owner-name <name>` | Server owner username |
| `--allow-op` | Allow op commands |
| `--disable-sentry` | Disable crash reporting |
| `--help` | Show all options |

**Example:**
```bash
./run_server.sh --backup --backup-frequency 30 --allow-op
```

---

## 6. File Structure

```
<game_path>/
├── Assets.zip                 # Game assets (required)
├── Client/                    # Game client
└── Server/
    ├── HytaleServer.jar       # Server executable (pre-patched)
    ├── HytaleServer.aot       # AOT cache (faster startup)
    ├── universe/              # World data
    │   ├── world/             # Default world
    │   └── players/           # Player data
    ├── mods/                  # Server mods (optional)
    └── Licenses/              # License files
```

---

## 7. Backups

### a. Automatic Backups

```bash
./run_server.sh --backup --backup-dir ./backups --backup-frequency 30
```

### b. Manual Backup

1. Use `save` command or stop the server
2. Copy the `universe/` folder
3. Store in a safe location

### c. Restore

1. Stop the server
2. Delete/rename current `universe/`
3. Copy backup to `universe/`
4. Restart server

---

## 8. Troubleshooting

### a. "Java not found" or "Java version too old"

**Java 21 is REQUIRED** (the server uses class file version 65.0).

**Install Java 21:**
- **Windows:** `winget install EclipseAdoptium.Temurin.21.JDK`
- **macOS:** `brew install openjdk@21`
- **Ubuntu:** `sudo apt install openjdk-21-jdk`
- **Fedora:** `sudo dnf install java-21-openjdk`
- **Arch:** `sudo pacman -S jdk21-openjdk`
- **Download:** [adoptium.net/temurin/releases/?version=21](https://adoptium.net/temurin/releases/?version=21)

**macOS: Set Java 21 as default:**
```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
```
Add these lines to `~/.zshrc` or `~/.bash_profile` to make permanent.

### b. "Port already in use"

```bash
./run_server.sh --bind 0.0.0.0:5521
```

### c. "Out of memory"

Increase JVM_XMX:
```bash
JVM_XMX=6G ./run_server.sh
```

### d. Players can't connect

1. Server shows "Server Ready"?
2. Using F2P Launcher (not official)?
3. Port 5520 open in firewall?
4. Port forwarding configured (for internet)?
5. Try `--auth-mode unauthenticated` for testing

### e. "Authentication failed"

- Ensure players use F2P Launcher
- Auth server may be temporarily down
- Test with `--auth-mode unauthenticated`

---

## 9. Docker Deployment (Advanced)

For production servers, use Docker:

```bash
docker run -d \
  --name hytale-server \
  -p 5520:5520/udp \
  -v ./data:/data \
  -e HYTALE_AUTH_DOMAIN=auth.sanasol.ws \
  -e HYTALE_SERVER_NAME="My Server" \
  -e JVM_XMX=8G \
  ghcr.io/hybrowse/hytale-server-docker:latest
```

See [Docker documentation](https://github.com/Hybrowse/hytale-server-docker) for details.

---

## 10. Getting Help

- Check server console logs for errors
- Test with `--auth-mode unauthenticated` first
- Ensure all players have F2P Launcher
- Join the community for support

---

# Credits

- Hytale F2P Project
- [Hybrowse Docker Image](https://github.com/Hybrowse/hytale-server-docker)
- Auth Server: sanasol.ws





