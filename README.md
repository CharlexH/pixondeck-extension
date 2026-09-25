<div align="center">

<img src="assets/icon.png" width="80" alt="PixOnDeck logo">

# PixOnDeck — Image to Prompt

**Turn images you find on the web into editable AI prompts.**

**English** · [简体中文](README.zh-CN.md)

[![Download ZIP](https://img.shields.io/badge/Download_ZIP-Manual_install-6D4AFF?style=for-the-badge)](https://github.com/CharlexH/pixondeck-extension/releases/download/v1.0.1/pixondeck-chrome-1.0.1-manual-install.zip)
[![Chrome Web Store — coming soon](https://img.shields.io/badge/Chrome_Web_Store-Coming_soon-64748B?style=for-the-badge)](#chrome-web-store)
[![Website](https://img.shields.io/badge/Visit-PixOnDeck-18181B?style=for-the-badge)](https://pixondeck.com/extension?utm_source=github&utm_medium=referral&utm_campaign=extension_open_source&utm_content=readme_website)

Pick an image → Get a prompt → Edit, save, or keep creating.

</div>

> **Install manually for now.** The Chrome Web Store version is not available yet. Download the prepared ZIP above; no Node.js, terminal or build step is required.

[Installation](#manual-installation) · [First prompt](#create-your-first-prompt) · [Updates & help](#updates-and-troubleshooting) · [Privacy](#privacy-and-permissions) · [Developers](#for-developers)

## Product screenshots

Actual client UI with local demo data and an edited sample prompt. These screenshots illustrate the interface, not model quality or real account activity. Click an image to enlarge.

<table>
  <tr>
    <td width="33%" valign="top"><strong>Edit a prompt</strong><br><br><a href="docs/screenshots/workspace.png"><img src="docs/screenshots/workspace.png" alt="Edit a prompt" width="300"></a></td>
    <td width="33%" valign="top"><strong>Saved prompts</strong><br><br><a href="docs/screenshots/saved-prompts.png"><img src="docs/screenshots/saved-prompts.png" alt="Saved prompts" width="300"></a></td>
    <td width="33%" valign="top"><strong>Bring your own API key</strong><br><br><a href="docs/screenshots/byok-settings.png"><img src="docs/screenshots/byok-settings.png" alt="Bring your own API key" width="300"></a></td>
  </tr>
</table>

[Watch the short walkthrough](src/assets/welcome-demo.mp4) — an illustrated interaction, not a recorded model benchmark.

## Manual installation

Requires desktop **Chrome 116 or later**. Managed work or school browsers may restrict developer-mode installation.

1. **[Download the manual-install ZIP](https://github.com/CharlexH/pixondeck-extension/releases/download/v1.0.1/pixondeck-chrome-1.0.1-manual-install.zip).** Choose `pixondeck-chrome-1.0.1-manual-install.zip`, not GitHub’s automatic **Source code** downloads.
2. **Extract it into a permanent folder**, such as `Documents/PixOnDeck-extension`. Keep that folder after installation.
3. **Open Chrome’s extension manager.** Paste `chrome://extensions` into the address bar.
4. **Turn on Developer mode** in the upper-right corner.
5. **Click “Load unpacked”** and select the extracted folder containing `manifest.json`.
6. **Pin PixOnDeck** from Chrome’s puzzle-piece Extensions menu, then click its icon to open the side panel.

The folder you select should look like this:

```text
PixOnDeck-extension/
├── manifest.json    ← select this folder
├── panel.html
├── panel.js
├── background.js
└── ...
```

**Installation check:** the extension ID should be `abghgbjbefmiakmklkkoabgbeengkkgd`. The supplied package includes the official public identity and service configuration. If the ID differs, check that you downloaded the manual-install asset and did not edit `manifest.json`.

These steps follow [Chrome’s official unpacked-extension guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Create your first prompt

1. Open the PixOnDeck side panel and **sign in**. Both processing modes currently require a PixOnDeck account.
2. **Upload an image**, or select an image on a normal webpage using its image action or right-click menu. Refresh pages that were already open before installation.
3. **Choose a mode** in the account menu and start the task.
4. **Edit the result**, then copy it, save it, or use an available generation action.

| Mode | What you need | Billing |
| --- | --- | --- |
| **PixOnDeck credits** | A PixOnDeck account with available credits | Uses PixOnDeck credits |
| **Your API key (BYOK)** | A trusted HTTPS provider, API key and OpenAI-compatible image-input model | Your provider may charge |

BYOK settings are in the account menu. An image-to-prompt result is an AI interpretation, not recovery of the image’s original prompt. Website image generation is a separate, user-initiated action.

## Why PixOnDeck?

| Feature | What it helps you do |
| --- | --- |
| Web image capture | Start from a reference without leaving the page |
| Editable prompts | Adjust the result to suit your next idea |
| BYOK support | Use a compatible vision provider of your choice |
| Recent tasks and cloud favorites | Revisit your work and keep useful prompts |
| Open client source | Inspect image preparation, permissions and request handling |

## Chrome Web Store

**Coming soon — not publicly available yet.** The button above points here until a public listing is available. Use the manual-install ZIP in the meantime. Check the [official extension page](https://pixondeck.com/extension?utm_source=github&utm_medium=referral&utm_campaign=extension_open_source&utm_content=store_status) for product updates.

## Updates and troubleshooting

Manual installations **do not update automatically**. Download the next manual-install ZIP from [Releases](https://github.com/CharlexH/pixondeck-extension/releases), replace the contents of the same installation folder, and click **Reload** on the extension’s card at `chrome://extensions`. Then refresh webpages using the image action. Avoid removing the extension just to update it; removal can clear local data. Reloading also clears the session-only BYOK key, so enter it again if needed.

| Problem | Try this |
| --- | --- |
| “Manifest file is missing or unreadable” | Extract the ZIP first and select the folder that directly contains `manifest.json` |
| No image action on the page | Refresh the webpage, check Chrome site-access permission, or use local upload |
| Chrome internal pages, the store, canvas or CSS backgrounds | Use local upload; these are not supported capture surfaces |
| Sign-in does not appear in the panel | Finish website sign-in, close and reopen the panel, and verify the extension ID above |
| BYOK request fails | Check the URL, key, model image support and provider balance |
| Developer mode is unavailable | Your browser administrator may restrict unpacked extensions |

Still stuck? [Report a reproducible issue](https://github.com/CharlexH/pixondeck-extension/issues). Never include API keys, tokens or private images. Account or billing help: [hello@pixondeck.com](mailto:hello@pixondeck.com).

## Privacy and permissions

- Only selected images are submitted for analysis. The client reduces image-to-prompt inputs to a maximum **480-pixel edge**.
- Credit-mode images go to PixOnDeck and its processing providers. BYOK images and credentials go directly to your configured provider.
- BYOK keys remain in trusted **extension session storage**, not persistent settings or PixOnDeck requests.
- Saving a cloud favorite sends its prompt and thumbnail to your PixOnDeck account.
- Webpage access enables capture, cookies support shared sign-in, and storage holds settings/history. The client does not implement browsing-history collection.

Read the [data-flow and permissions guide](docs/privacy.md) and [official privacy policy](https://pixondeck.com/en/privacy). AI processing is online and may cost credits or provider fees.

## For developers

<details>
<summary><strong>Build from source or run the fixture preview</strong></summary>

Requires Node.js 22.18+. Ordinary users should use the prepared ZIP above.

```sh
git clone https://github.com/CharlexH/pixondeck-extension.git
cd pixondeck-extension
npm ci
cp .env.example .env
npm run typecheck
npm test
npm run build
```

Load `dist/` at `chrome://extensions`. Unlike the official manual-install package, the default source build creates a local development identity and has no live authentication configuration. A successful build alone does not grant access to production services. See [development and service requirements](docs/development.md).

`npm run preview` starts the fixture interface at `http://127.0.0.1:8791`. It uses simulated data; use dummy keys only.

</details>

[Contribution guide](CONTRIBUTING.md) · [Roadmap](docs/roadmap.md) · [Security reports](SECURITY.md)

## Support and license

If PixOnDeck helps your workflow, **star this repository** to help others discover it.

Original code and documentation: [Apache-2.0](LICENSE) with [NOTICE](NOTICE). Dependencies retain their [own licenses](THIRD_PARTY_NOTICES.txt); visual assets are covered by [BRANDING.md](BRANDING.md). The hosted backend and billing service are not included.
