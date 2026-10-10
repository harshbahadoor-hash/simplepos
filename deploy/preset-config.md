# Install the preset config service

These files prepare deployment; they do not modify a running server automatically. Deploy and verify this service and its Caddy route before deploying the preset-enabled frontend. The existing static frontend deployment stays separate from persisted presets. Use one Node 24 service process with one data directory.

1. On the Linux host, verify Node 24 is available at `/usr/bin/node`, and verify `127.0.0.1:4318` is free. If the port changes, update both the environment file and Caddy upstream.
2. Create a dedicated system account `simplepos-presets` with no login shell or home directory. For example, `useradd --system --user-group --no-create-home --shell /usr/sbin/nologin simplepos-presets` if the account does not already exist.
3. Copy the following files into an application directory owned by root and readable by the service user. No npm install or frontend release assets are needed:

```text
/opt/simplepos-presets/
  server/presets/errors.mjs
  server/presets/main.mjs
  server/presets/server.mjs
  server/presets/store.mjs
  src/presets/schema.mjs
  src/presets/defaults.json
```

4. Copy `deploy/simplepos-presets.service` to `/etc/systemd/system/simplepos-presets.service`. Copy `deploy/preset-config.env.example` to `/etc/simplepos-presets.env`, with PRESET_ALLOWED_ORIGIN set to the exact existing HTTPS site. The unit creates `/var/lib/simplepos-presets` with private permissions through StateDirectory. Presets survive application updates and remain outside `/srv/simplepos/current`.
5. Run `systemd-analyze verify /etc/systemd/system/simplepos-presets.service`, then `systemctl daemon-reload` and `systemctl enable --now simplepos-presets`. Confirm the dedicated user and loopback listener with `systemctl status simplepos-presets` and `ss -ltnp`. A local no-Origin check is `curl -i http://127.0.0.1:4318/preset-config/current`.
6. Copy `deploy/preset-config.caddy` to `/etc/caddy/preset-config.caddy`. Add `import /etc/caddy/preset-config.caddy` inside the existing SimplePOS HTTPS site. The complete `deploy/simplepos.caddy` demonstrates the route and static fallback; preserve other sites in the live Caddyfile. Use `handle`, which preserves the request path, rather than `handle_path`. Caddy's HTTP upstream preserves Host and supplies X-Forwarded-Host/X-Forwarded-Proto. See the official [handle](https://caddyserver.com/docs/caddyfile/directives/handle) and [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) documentation.
7. Validate the complete candidate Caddyfile with `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`, then reload Caddy. Confirm the public current route returns JSON, a quoted revision ETag and Cache-Control: no-store. Confirm the same-site browser and no-Origin CLI can read it, and a wrong Origin is rejected. Publishing has no login, credentials or authentication.

The existing `deploy/install.py` is a static-site installation helper; install the config service/snippet separately before using the updated site example. Do not install or seed config files into the frontend release directory. Read-only service code lives in /opt, while systemd's private [StateDirectory](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml) remains writable under ProtectSystem=strict.

Deployment acceptance still requires an actual Linux/systemd/Caddy run, then laptop-to-tablet and tablet-to-laptop publication checks using the frontend's safe sale boundary. An offline device continues to use its locally cached config. This service never receives sales or receipt information. After a successful write whose response was lost, inspect current settings and GET /preset-config/publications/<key> before deciding whether another publish is needed.

For an upgrade, stop the service, update only service code and the shared schema/seed, then restart it. Keep /var/lib/simplepos-presets intact. Never run a second process against the same store. If startup returns storage 503, inspect service state and retained envelopes; do not delete them to force the bundled defaults. Back up the data directory while the service is stopped to preserve a coherent set of configuration-only recovery files.
