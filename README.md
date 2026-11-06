<p align="center">
  <img src="dashboard/public/zxkai.svg" alt="Zxkai logo" width="96" />
</p>

<h1 align="center">Zxkai</h1>

<p align="center"><strong>WhatsApp API Gateway and Dashboard</strong></p>
<p align="center">Made by Shashank · Built on the open-source OpenWA project</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#connect-a-whatsapp-session">Connect WhatsApp</a> ·
  <a href="#spreadsheet-broadcasts">Broadcasts</a> ·
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/ffidshashank-code/zxkai.wp?label=version" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT license" />
  <img src="https://img.shields.io/badge/Node.js-22_LTS-brightgreen.svg" alt="Node.js 22" />
</p>

Zxkai is a self-hosted WhatsApp API with a web dashboard for managing sessions, templates, messages, webhooks, API keys, and integrations. The repository is a branded and extended fork of [OpenWA](https://github.com/rmyndharis/OpenWA); upstream documentation and copyright notices remain applicable.

## Quick Start

### Requirements

- Node.js 22.19 or newer (Node.js 22 LTS is recommended).
- npm.
- A dedicated WhatsApp account to link as a companion device. Do not use a number you cannot afford to lose.

### Local development

```bash
git clone https://github.com/ffidshashank-code/zxkai.wp.git
cd zxkai.wp
npm ci
npm run dev
```

The root install also installs the dashboard dependencies and applies the required WhatsApp-client compatibility patches. The development command starts the API and Vite dashboard together.

| Service | Address |
| --- | --- |
| Dashboard | <http://localhost:2886> |
| API | <http://localhost:2785/api> |
| Swagger API reference | <http://localhost:2785/api/docs> |
| Health check | <http://localhost:2785/api/health> |
| Broadcast page | <http://localhost:2886/broadcast> |

The default local configuration uses SQLite. On first startup, Zxkai creates its local data directory and generates a cryptographically random admin API key (`owa_k1_...`) at `data/.api-key`. There is no shared static default key; the generated value is unique to your installation.

For isolated local testing only, setting `ALLOW_DEV_API_KEY=true` explicitly seeds the insecure, well-known key `dev-admin-key`. Do not use it for an internet-accessible instance; production startup rejects this development override. Alternatively, `API_MASTER_KEY` can set the initial admin key before the first key is created; production requires a strong value. Changing either setting after the initial key has been stored does not rotate existing keys.

### Sign in

Read the generated key locally and paste it into the dashboard login form:

```bash
cat data/.api-key
```

Treat this key like a password. Do not commit it, put it in screenshots, or send it to other people. For scripts, pass it in an environment variable rather than writing it into source code:

```bash
export API_KEY="$(cat data/.api-key)"
```

### Docker

For a local Docker deployment, use the development compose file:

```bash
git clone https://github.com/ffidshashank-code/zxkai.wp.git
cd zxkai.wp
docker compose -f docker-compose.dev.yml up -d --build
```

The bundled dashboard and API are available at <http://localhost:2785>. Check logs with `docker compose -f docker-compose.dev.yml logs -f` and stop the stack with `docker compose -f docker-compose.dev.yml down`. Do not add `--volumes` unless you intend to delete local sessions, credentials, and database data.

To run a published image, configure the override as described in the deployment guide, then use:

```bash
docker compose pull openwa-api && docker compose up -d --no-build
```

The compose service keeps its `build:` definition. The command above fails if the pull fails rather than silently building a source image under the published tag. Do not use `--build` with the published-image override.

## Connect a WhatsApp Session

1. Sign in to the dashboard and open **Sessions**.
2. Create a session with a recognizable name.
3. Start the session and open its QR code when the session is waiting to link.
4. On your phone, open WhatsApp **Settings → Linked Devices → Link a device**, then scan the QR code.
5. Wait for the session status to become **Ready** before sending a message.

The QR flow links an existing WhatsApp account; it does not create a new account. Phone-number pairing is also available, but QR pairing is the safer choice when the number is already linked elsewhere. On the `whatsapp-web.js` engine, requesting a pairing code for an already-linked number can cause WhatsApp to unlink that device.

If the session fails, open its detail view and inspect the error. For local `whatsapp-web.js` sessions, Chromium must be installed with its system libraries. A missing-library error such as `libatk-1.0.so.0` means the OS runtime dependencies are missing; see [Troubleshooting](docs/12-troubleshooting-faq.md). Check API health separately at <http://localhost:2785/api/health>.

### API example

The dashboard is the easiest way to create and link a session. The same operations are available through the REST API; session routes use the session UUID returned by creation.

```bash
# Create a session and save its id from the JSON response.
curl -X POST http://localhost:2785/api/sessions \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"support-bot"}'

# Start it, then use the dashboard or QR endpoint to link WhatsApp.
curl -X POST "http://localhost:2785/api/sessions/$SESSION_ID/start" \
  -H "X-API-Key: $API_KEY"
```

## Templates

Templates belong to a session. In the dashboard, open **Templates**, select the session, and create a template with a name and body. Optional header and footer text are supported. Add double-brace placeholders such as `{{owner_name}}` or `{{reg_no}}` where recipient-specific values should appear.

Example body:

```text
Hello {{owner_name}}, we have an update about registration {{reg_no}}.
```

When a saved template is selected on the Broadcast page, its header, body, and footer are combined for the preview. The gateway fills the placeholders separately for each recipient using the matching spreadsheet values. Only variables referenced by the template are sent.

## Spreadsheet Broadcasts

Open **Broadcast** in the sidebar or go to <http://localhost:2886/broadcast>.

1. Choose a ready WhatsApp session.
2. Select a saved template, or use a custom message with placeholders.
3. Upload an `.xlsx`, `.xls`, `.csv`, or `.json` file (up to 2 MB). Excel imports use the first worksheet.
4. Check the eligible/excluded count and the first-recipient preview.
5. Send the batch and follow its progress in the response panel. A running batch can be cancelled there.

The sheet needs a phone column named `MOBILE`, `MOBILE NO`, `PHONE`, or a supported variant, plus an explicit `CONSENT` or `OPT_IN` column. Only rows whose consent cell is `yes` or `true` are eligible. Add that column only where you have a genuine record of consent; the importer never assumes consent or marks a row opted in for you. Rows without consent, with invalid numbers, or with duplicate numbers are excluded. A batch is limited to 100 eligible recipients.

Indian numbers are accepted as 10 digits, `91` plus 10 digits, `+91` plus 10 digits, or the `0091` international prefix. They are normalized to `91…@c.us` before sending.

### Template variables from the provided columns

Column names are trimmed, lowercased, and converted to snake_case. For example:

| Spreadsheet column | Template variable |
| --- | --- |
| `STATE` | `{{state}}` |
| `REG NO` | `{{reg_no}}` |
| `RTO CODE` | `{{rto_code}}` |
| `REG DATE` | `{{reg_date}}` |
| `OWNER NAME` | `{{owner_name}}` |
| `OWNER(S/W/D)` | `{{owner_s_w_d}}` |
| First `ADDRESS` column | `{{address}}` |
| Second `ADDRESS` column | `{{address_2}}` |
| `city` | `{{city}}` |
| `ENGINE NO` | `{{engine_no}}` |
| `CHASIS NO` | `{{chasis_no}}` |
| `VEHICLE MAKE` | `{{vehicle_make}}` |
| `VEHICLE MODEL VARIANT` | `{{vehicle_model_variant}}` |
| `VEHICLE CLASS` | `{{vehicle_class}}` |
| `FUEL` | `{{fuel}}` |
| `SALE AMOUNT` | `{{sale_amount}}` |
| `SEAT CAPACITY` | `{{seat_capacity}}` |
| `MOBILE` | `{{mobile}}` |

Repeated column names receive a numeric suffix after the first occurrence (`ADDRESS`, `ADDRESS_2`, and so on). The Broadcast page lists the imported column variables after the file loads. Unknown template placeholders stay visible in the preview and prevent sending.

**Privacy and delivery:** use only recipient data you are authorized to process and numbers whose owners opted in. WhatsApp may restrict accounts for unsolicited or high-volume messaging. Pace sends, use a dedicated account, and provide an opt-out path where applicable. This unofficial integration is not a substitute for the official WhatsApp Business Platform in regulated or business-critical deployments.

## Configuration and Security

- Copy `.env.example` to `.env` only when you need to override defaults. Keep `.env`, `data/`, session credentials, and API keys out of Git.
- The local API binds to port `2785`; Vite serves the development dashboard on `2886` and proxies API/WebSocket traffic to the backend.
- Use a least-privilege API key for integrations. Admin keys can manage sessions and keys; operator and viewer keys have narrower permissions. Session and chat scopes are available for additional restriction.
- Use HTTPS and a reverse proxy before exposing an instance outside localhost. Never publish the bootstrap key or expose an unauthenticated API.
- WhatsApp access uses unofficial, reverse-engineered clients. Account restriction or device unlinking is possible; use a dedicated number and keep a fallback channel.
- The storage backend is the live media store for statuses and archived chat media. Other message media may be returned inline. `scripts/backup.sh` archives only the local media directory, so an S3 bucket needs a backup of its own.

## MCP Server

The optional Model Context Protocol endpoint is off by default. Set `MCP_ENABLED=true` to mount it at `POST /mcp`. It exposes 26 read-only tools by default; set `MCP_READONLY=false` to enable all 52 tools, including the write tier. MCP calls use the same API-key roles and session scopes as the REST API. Use a least-privilege key and do not expose `/mcp` publicly without a fronting authentication layer.

## Development and Checks

```bash
npm run build:all       # Build API and dashboard
npm test                # API unit tests
npm run test:scripts    # Script and contract checks
npm run test:docs       # Documentation governance tests
npm run lint            # API lint
npm run dashboard:build # Dashboard typecheck and production build
npm run dashboard:ci    # Reinstall dashboard dependencies from its lockfile
```

Dashboard-specific checks can also be run from `dashboard/`:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run i18n:check
```

## Documentation

- [Documentation index](docs/INDEX.md)
- [API specification](docs/06-api-specification.md) and local Swagger at `/api/docs`
- [Local phone-number pairing guide](docs/examples/session-phone-number-pairing.md)
- [Dashboard guide](dashboard/GUIDE.md)
- [SDK overview](sdk/GUIDE.md) and language guides under `sdk/`
- [Contributing](CONTRIBUTING.md), [security policy](SECURITY.md), and [license](LICENSE)

## Project Identity

Zxkai is maintained and branded by Shashank and is based on the OpenWA project. It is an independent project and is not affiliated with, associated with, authorized, endorsed by, or officially connected to WhatsApp LLC or Meta Platforms, Inc. WhatsApp names and marks belong to their respective owners.

## Disclaimer

Zxkai and its upstream OpenWA components are independent open-source software, not affiliated with, associated with, authorized, endorsed by, or in any way officially connected with Meta Platforms, Inc., WhatsApp LLC, or any of their subsidiaries or affiliates. The official WhatsApp website is [whatsapp.com](https://www.whatsapp.com). The name "WhatsApp" and related names, marks, emblems, and images are registered trademarks of their respective owners.

Use the software at your own risk. You are responsible for complying with WhatsApp's terms, privacy obligations, consent requirements, and applicable law.

## License and Upstream

This repository is licensed under the MIT License; see [LICENSE](LICENSE). Zxkai is a fork/customization of [OpenWA](https://github.com/rmyndharis/OpenWA). Preserve the upstream license and notices when redistributing derived work.
