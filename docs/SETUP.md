# Setting up Eikon

This guide takes you from an empty NAS to Eikon on your iPhone's home screen. Budget about an hour.

```
 iPhone / iPad / Mac ──Tailscale (HTTPS)──► NAS: tailscale serve :443 ──► 127.0.0.1:8080  Eikon container
                                                                             │
                                                           Tailscale (HTTP)  ▼
                                                     gpubox: tailscale serve :7860 ──► 127.0.0.1:7861  Tagger container
```

Nothing is reachable from your LAN or the internet. Both containers listen on loopback only, and
`tailscale serve` is the single door into each machine.

**You will need**

- The Synology NAS with **Container Manager** and the **Tailscale** package installed and signed in.
- **gpubox** with the NVIDIA driver, Docker, and Tailscale signed in.
- **SSH access** to the NAS (DSM → Control Panel → Terminal & SNMP → Enable SSH). Every NAS command below runs over SSH.
- Admin access to the Tailscale admin console (<https://login.tailscale.com/admin>).

---

## Part 1 — gpubox: start the tagger

Follow [`deploy/gpubox/README.md`](../deploy/gpubox/README.md). When you finish, these should be true:

- `curl http://gpubox:7860/health` from your Mac returns `{"status":"ok", … "device":"cuda"}`.
- You have written down the `TAGGER_TOKEN` you put in `deploy/gpubox/.env`.

Then note gpubox's full MagicDNS name. Your tailnet name is shown in the admin console under **DNS**
(e.g. `tail1234.ts.net`), so gpubox is `gpubox.tail1234.ts.net`. From your Mac, check that it resolves:

```bash
curl http://gpubox.tail1234.ts.net:7860/health
```

Eikon uses this full name rather than the short `gpubox`, because containers don't get Tailscale's search domain.

---

## Part 2 — NAS: lay out your library

Eikon reads one shared folder with two subfolders:

```
/volume1/Illustrations/            ← any share works; it's mounted read-only
├── Illustrators/
│   ├── Wlop/                      ← one folder per illustrator (subfolders inside are fine)
│   └── Guweiz/
└── Collections/
    ├── Golden Hour/               ← one folder per collection; may repeat images from Illustrators/
    └── Desktop Rotation/
```

- Supported files: JPG, PNG, WebP, GIF and AVIF. Other files are ignored, and so are Synology's `@eaDir` and `#recycle` folders.
- Eikon never changes this folder. If the same image appears in an illustrator folder and in a collection, it is stored and tagged once.

Then create a folder for Eikon's own data (database and thumbnails, roughly 300 KB per image), for example
`/volume1/docker/eikon-data`, using File Station or over SSH:

```bash
sudo mkdir -p /volume1/docker/eikon-data
```

---

## Part 3 — NAS: let containers reach gpubox

The Synology Tailscale package runs in *userspace* mode by default. In that mode the NAS can accept
tailnet traffic, but processes on it, including containers, cannot connect *out* to other tailnet
machines. Eikon needs to reach gpubox, so switch Tailscale to TUN mode:

```bash
sudo /var/packages/Tailscale/target/bin/tailscale configure-host
sudo synosystemctl restart pkgctl-Tailscale.service
```

This setting does **not** survive a reboot. To re-apply it at every boot:

1. DSM → **Control Panel → Task Scheduler → Create → Triggered Task → User-defined script**.
2. **General:** Task name `Tailscale TUN`, User `root`, Event `Boot-up`.
3. **Task Settings → Run command:**
   ```bash
   /var/packages/Tailscale/target/bin/tailscale configure-host; synosystemctl restart pkgctl-Tailscale.service
   ```
4. Save. You can run it once now with **Run** to test it.

Check that the NAS can now reach gpubox:

```bash
curl http://gpubox.tail1234.ts.net:7860/health
```

If this times out, TUN mode isn't active yet. If it says the host can't be resolved, try
`curl http://$(/var/packages/Tailscale/target/bin/tailscale ip -4 gpubox):7860/health`. If that works, the NAS
itself isn't using MagicDNS, which is fine: the Eikon container asks Tailscale's resolver (`100.100.100.100`) directly.

> **Tailscale ACLs:** if your tailnet uses access rules, make sure the NAS may reach `gpubox:7860`,
> and your phone, iPad and Mac may reach the NAS on port 443.

---

## Part 4 — NAS: install and start Eikon

### 4.1 Get the code onto the NAS

```bash
cd /volume1/docker
sudo git clone https://github.com/<you>/eikon.git        # Git is available from Package Center → Git Server
```

No Git? Download the repository ZIP on your Mac, then upload and extract it to `/volume1/docker/eikon` with File Station.

### 4.2 Configure

```bash
cd /volume1/docker/eikon/deploy/nas
sudo cp .env.example .env
id                                    # note uid= and gid=, e.g. uid=1026(you) gid=100(users)
sudo vi .env                          # or edit it in File Station → Open with Text Editor
```

Fill in:

| Setting | Value |
|---|---|
| `LIBRARY_PATH` | Your share from Part 2, e.g. `/volume1/Illustrations` |
| `DATA_PATH` | The data folder from Part 2, e.g. `/volume1/docker/eikon-data` |
| `PUID` / `PGID` | The `uid` and `gid` printed by `id` |
| `EIKON_PASSCODE` | Your passcode. Digits only gives a keypad. Empty disables the lock screen |
| `EIKON_TAGGER_URL` | `http://gpubox.<tailnet>.ts.net:7860`, with the name from Part 1 |
| `EIKON_TAGGER_TOKEN` | The same value as `TAGGER_TOKEN` on gpubox |
| `TZ` | Your time zone, e.g. `Europe/Paris` |
| `EIKON_HOST_PORT` *(optional)* | Loopback port on the NAS, default `8080`. Change it only if 8080 is taken; Part 5.2 must then use the same port |

Make sure that user can write the data folder and read the library:

```bash
sudo chown -R <uid>:<gid> /volume1/docker/eikon-data
```

### 4.3 Build and start

```bash
cd /volume1/docker/eikon/deploy/nas
sudo docker compose up -d --build     # first build takes a few minutes
sudo docker compose logs -f           # Ctrl-C to stop following
```

Look for `Eikon is ready`, then `tagger online` and `scan finished`. Check it from the NAS
(replace 8080 if you set `EIKON_HOST_PORT`):

```bash
curl http://127.0.0.1:8080/api/auth/status
# {"required":true,"authenticated":false,"numeric":true}

sudo docker exec eikon node -e "fetch(process.env.EIKON_TAGGER_URL+'/health').then(r=>r.text()).then(console.log)"
# {"status":"ok","model":"wd-eva02-large-tagger-v3","device":"cuda"}
```

> **Prefer the GUI?** Container Manager → **Project → Create**. Set the path to
> `/volume1/docker/eikon/deploy/nas`, choose "Use existing docker-compose.yml", and start it.
> You still need to create the `.env` file first.

---

## Part 5 — Publish Eikon to your tailnet over HTTPS

### 5.1 Turn on HTTPS for your tailnet (one time)

In the Tailscale admin console, open **DNS**:

1. Make sure **MagicDNS** is enabled.
2. Under **HTTPS Certificates**, click **Enable HTTPS**.

Note your tailnet name on the same page, e.g. `tail1234.ts.net`. Your NAS will be
`https://<nas-machine-name>.tail1234.ts.net`. You can rename the machine under **Machines** first if you'd
like a nicer URL, for example `eikon`.

> Tailscale certificates are public: machine names show up in Certificate Transparency logs.
> Your tailnet stays private, but don't put anything secret in the machine name.

### 5.2 Start serving

Three ports are involved. Only the first two are yours to choose:

```
your devices ──► https://<nas>.tail1234.ts.net:<HTTPS_PORT> ──tailscale serve──► 127.0.0.1:<EIKON_HOST_PORT> ──Docker──► container :8080
                  default 443                                                     default 8080 (.env)                         fixed
```

| Port | Where it's set | Default | Notes |
|---|---|---|---|
| `HTTPS_PORT` | the `--https=` flag below | `443` | What your devices connect to. With 443 the URL needs no port number |
| `EIKON_HOST_PORT` | `deploy/nas/.env` | `8080` | Loopback-only port on the NAS. Change it if another app already uses 8080 |
| container port | the image | `8080` | Never changes |

The general command is:

```bash
sudo /var/packages/Tailscale/target/bin/tailscale serve --bg --https=<HTTPS_PORT> http://127.0.0.1:<EIKON_HOST_PORT>
```

With the defaults:

```bash
sudo /var/packages/Tailscale/target/bin/tailscale serve --bg --https=443 http://127.0.0.1:8080
sudo /var/packages/Tailscale/target/bin/tailscale serve status
```

`serve status` should show:

```
https://<nas>.tail1234.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:8080
```

For example, with `EIKON_HOST_PORT=8090` in `.env` and devices connecting on 8443:

```bash
sudo /var/packages/Tailscale/target/bin/tailscale serve --bg --https=8443 http://127.0.0.1:8090
# then open https://<nas>.tail1234.ts.net:8443
```

- The address after `http://127.0.0.1:` must match `EIKON_HOST_PORT`. If they differ, the page fails with a proxy error.
- Check that port is free before choosing it: `sudo netstat -tlnp | grep :8090` should print nothing (before Eikon starts).
- `--bg` saves the configuration, so it survives reboots and Tailscale package restarts. You only do this once.
- The first visit can take a few seconds while Tailscale obtains the certificate.
- "tailnet only" is what you want. Do **not** use `tailscale funnel`, which would expose Eikon to the internet.
- To undo: `sudo /var/packages/Tailscale/target/bin/tailscale serve --https=<HTTPS_PORT> off`.
- To change ports later, undo the old mapping first, then run the command again with the new ports.

### 5.3 Open it

On any device signed in to Tailscale, open `https://<nas>.tail1234.ts.net`, enter your passcode, and you're in.
The first scan and tagging run in the background. The ring next to the logo shows their progress.

---

## Part 6 — Put Eikon on your devices

- **iPhone / iPad:** open the URL in **Safari** → Share → **Add to Home Screen**. It then opens full-screen like an app.
- **Mac:** in Safari, choose **File → Add to Dock**. In Chrome, use the install icon in the address bar.
- Tick **Remember this device** on the lock screen so you're only asked for the passcode once per device.

---

## Day to day

| Task | How |
|---|---|
| Add illustrations | Drop files into `Illustrators/<name>/` or `Collections/<name>/`. Eikon scans every 5 minutes, or use **Settings → Rescan library** |
| Fix a tag | Open the image → swipe up → **Edit tags**. Your edits are never overwritten by re-tagging |
| Change the passcode | Edit `EIKON_PASSCODE` in `.env`, then `sudo docker compose up -d`. This signs out every device |
| Update Eikon | `cd /volume1/docker/eikon && sudo git pull && cd deploy/nas && sudo docker compose up -d --build` |
| Back up | Back up `DATA_PATH`. Tags, favourites, and saved searches live in `eikon.db`; thumbnails can always be rebuilt |
| Switch tagging model | Change `TAGGER_MODEL_REPO` on gpubox, restart the tagger, then use **Settings → Re-tag all** |
| gpubox is off | Nothing breaks. New images wait in the queue and get tagged when gpubox is back |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| The status sheet (ring next to the logo) says **gpubox offline** | From the NAS, run `curl http://gpubox.<tailnet>.ts.net:7860/health`. If that fails, redo Part 3 (TUN mode) and check `tailscale serve status` on gpubox. If it works from the NAS but not from the container, check `EIKON_TAGGER_URL` in `.env` (it must be the full `.ts.net` name), then run the `docker exec` check from 4.3 |
| Container logs show `getaddrinfo ENOTFOUND gpubox…` | The container can't reach Tailscale's resolver at `100.100.100.100`, which almost always means TUN mode is off (Part 3). Re-run the boot task, then `sudo docker compose restart` |
| Tagging fails with "tagger responded 401" | `EIKON_TAGGER_TOKEN` on the NAS doesn't match `TAGGER_TOKEN` on gpubox |
| `https://<nas>…` doesn't load | Run `tailscale serve status` on the NAS, make sure HTTPS Certificates are enabled (5.1), and that the device is connected to Tailscale |
| `serve` complains that port 443 is in use | Pick another `HTTPS_PORT`, e.g. `tailscale serve --bg --https=8443 http://127.0.0.1:8080`, then open `https://<nas>…:8443`. See 5.2 |
| `https://<nas>…` shows a proxy or "bad gateway" error | `tailscale serve` points at a port where Eikon isn't listening. The port in `serve status` must equal `EIKON_HOST_PORT`, and `sudo docker compose ps` should show the container running |
| Library empty, status shows "No Illustrators/ or Collections/ folder found" | `LIBRARY_PATH` is wrong, or the folders are named differently. Names are case-insensitive but must be exactly `Illustrators` and `Collections` |
| Container restarts with "permission denied" on `/data` | `PUID`/`PGID` don't own `DATA_PATH`. Redo the `chown` in 4.2 |
| Some images never get tagged | Tap the status ring next to the Eikon logo. The **Library status** sheet lists failures with the reason, and **Retry** re-queues them |
| Sign-in keeps asking for the passcode | Use the HTTPS address. Eikon's cookie is marked Secure, so plain `http://` won't keep you signed in |

---

## Configuration reference (NAS container)

| Variable | Default | Meaning |
|---|---|---|
| `EIKON_PASSCODE` | *(empty = no lock screen)* | Lock-screen passcode |
| `EIKON_TAGGER_URL` | *(required in compose)* | Tagger base URL, e.g. `http://gpubox.tail1234.ts.net:7860` |
| `EIKON_TAGGER_TOKEN` | *(empty)* | Bearer token for the tagger |
| `EIKON_SCAN_INTERVAL_MINUTES` | `5` | Library rescan interval |
| `EIKON_PROCESS_CONCURRENCY` | `2` | Images hashed and thumbnailed in parallel during a scan |
| `EIKON_TAG_CONCURRENCY` | `2` | Parallel requests to the tagger |
| `EIKON_COOKIE_SECURE` | `false` (`true` in compose) | Mark the session cookie HTTPS-only |
| `EIKON_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `EIKON_LIBRARY_DIR` / `EIKON_DATA_DIR` / `EIKON_WEB_DIST` / `EIKON_HOST` / `EIKON_PORT` | set by the image | Leave these alone in Docker |

The tagger's settings are listed in [`tagger/README.md`](../tagger/README.md).
