# Client data flow and permissions

This guide describes the published source, not a guarantee about every provider or installed version. The official privacy policy governs the hosted product.

| Feature | Destination and storage |
| --- | --- |
| Web image selection | User-selected image URL is retrieved for processing; pending selection can remain in extension session storage for up to one hour |
| Image preparation | Resizing happens locally; image-to-prompt uploads have a maximum 480-pixel edge |
| Credit-mode analysis | Prepared image goes to PixOnDeck's backend and its processing providers |
| BYOK analysis | Prepared image and API key go directly to the configured compatible HTTPS provider |
| BYOK key | Account/endpoint-bound extension session storage; not persistent settings, Chrome Sync or PixOnDeck requests |
| Local history | Account-scoped drafts, thumbnails and image copies; up to 140 task tabs and seven-day expiry, cleaned when the extension runs |
| Cloud favorites | Explicitly saved prompt and thumbnail go to the PixOnDeck account service |
| Authentication | Clerk and PixOnDeck support shared login; tokens stay in trusted extension contexts |

Closing the side panel can interrupt a BYOK request; the provider may still bill it. Provider retention policies apply. Deleting local history does not remove server accounting records or independently saved cloud favorites. The client does not record browsing history or automatically submit every image on a page.

| Permission | Purpose |
| --- | --- |
| `sidePanel` | Open the workspace alongside a webpage |
| `contextMenus` | Offer a user-initiated image action |
| `scripting` and HTTP(S) host access | Register image-selection controls and retrieve selected images; Chrome site-access settings can restrict this |
| `storage` | Store preferences, account-scoped tasks and temporary credentials |
| `cookies` | Synchronize shared authentication with the configured site |

Chrome internal pages, the extension store, CSS backgrounds, canvas and cross-origin frames are not supported capture surfaces. Local upload is the fallback. See [official privacy policy](https://pixondeck.com/en/privacy).
