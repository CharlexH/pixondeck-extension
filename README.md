# PixOnDeck — Image to Prompt

An open-source Chrome extension that turns images from the web into editable AI prompts.
Use PixOnDeck credits or connect your own compatible vision API provider.

**[Get PixOnDeck for Chrome](https://pixondeck.com/extension?utm_source=github&utm_medium=referral&utm_campaign=extension_open_source&utm_content=readme_install)** · [Visit PixOnDeck](https://pixondeck.com?utm_source=github&utm_medium=referral&utm_campaign=extension_open_source&utm_content=readme_website) · [简体中文](README.zh-CN.md)

![Illustration of turning a reference image into a prompt](src/assets/welcome-demo-poster.jpg)

[Watch the short illustrated walkthrough](src/assets/welcome-demo.mp4). This animation explains the interaction; it is not a recorded model benchmark.

## From inspiration to a prompt you can use

- **Capture a reference:** select a webpage image using its image action or context menu, or upload a local image.
- **Make it yours:** review and edit the AI-generated prompt, then copy it or continue with supported generation actions.
- **Choose your provider:** use PixOnDeck credits or bring an API key for an OpenAI-compatible vision endpoint.
- **Keep useful results:** revisit recent local tasks and save prompts to your PixOnDeck account.
- **Inspect the client:** image preparation, browser permissions and BYOK request handling are available in this repository.

An image-to-prompt result is an AI interpretation of the image, not recovery of its original prompt. Results and provider compatibility vary.

## Get started

1. Open the [official extension page](https://pixondeck.com/extension?utm_source=github&utm_medium=referral&utm_campaign=extension_open_source&utm_content=get_started) for current installation availability and instructions.
2. Sign in with your PixOnDeck account. Both credit mode and BYOK currently require an account.
3. Select or upload an image, choose your mode, and start an image-to-prompt task.
4. Edit the result, copy it, or use the available save and generation actions.

| Mode | Processing | Cost |
| --- | --- | --- |
| PixOnDeck | Prepared image goes to the PixOnDeck service and its processing providers | Uses PixOnDeck credits; check current product pricing |
| BYOK | Prepared image goes directly to your configured HTTPS provider | Your provider may charge; a compatible image-input model is required |

Open-source code does not mean unlimited free AI processing. Website image generation is a separate, user-initiated action. This source snapshot can be newer than the published store build; check official availability before relying on a feature.

## Privacy and permissions

Only selected images are submitted for analysis. The client reduces images to a maximum 480-pixel edge before sending them for image-to-prompt processing. BYOK credentials are stored in trusted extension session storage and are sent to the configured provider, not to PixOnDeck. Cloud-saved prompts and thumbnails are sent to PixOnDeck when you choose to save them.

The extension uses webpage access for image selection, cookies for shared sign-in, storage for settings/history, and side-panel/context-menu APIs for the interface. It does not implement browsing-history collection. It is not an entirely offline tool.

Read [the client data-flow and permissions guide](docs/privacy.md) and the [official privacy policy](https://pixondeck.com/en/privacy).

## Build from source

Requires **Node.js 22.18+** and **Chrome 116+**.

```sh
git clone https://github.com/CharlexH/pixondeck-extension.git
cd pixondeck-extension
npm ci
cp .env.example .env
npm run typecheck
npm test
npm run build
```

Open `chrome://extensions`, enable Developer mode, and load `dist/` as an unpacked extension. The first build generates a local public development identity in ignored `development-key.json`.

**A successful build is not a working account/backend configuration.** Empty configuration builds the interface shell. Real sign-in and requests need a matching Clerk environment, API endpoints and authorization of the exact extension origin. This repository does not include the PixOnDeck backend or grant access to production services for arbitrary extension identities. See [development and service requirements](docs/development.md).

For a fixture-based interface preview without credentials:

```sh
npm run preview
```

Open `http://127.0.0.1:8791`. Preview data and provider responses are simulated; use dummy keys only. This is not real AI processing or browser-extension acceptance.

## Feedback and support

Found a reproducible bug? [Open an issue](https://github.com/CharlexH/pixondeck-extension/issues). Never include API keys, account tokens or private images. For account or billing help, contact [hello@pixondeck.com](mailto:hello@pixondeck.com).

If PixOnDeck helps your workflow, a GitHub star helps others discover the project.

Small fixes, documentation improvements and reproducible compatibility reports are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Current priorities are reliable image capture, clearer setup and provider compatibility; see the [roadmap](docs/roadmap.md).

## License

Original code and documentation are licensed under [Apache-2.0](LICENSE), with attribution in [NOTICE](NOTICE). Third-party dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). See [BRANDING.md](BRANDING.md) for branding and media permissions.

This is the official PixOnDeck extension client. The hosted service, billing and backend are not part of this repository.
