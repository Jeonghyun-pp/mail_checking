# mailchecking — Chrome Extension

Find and verify work emails from any page (and from LinkedIn profiles), then
save them as leads — all backed by the mailchecking public API.

## Install (developer mode)

1. Run the mailchecking app locally (`npm run dev` — http://localhost:3000).
2. Create an API key: open the app → **Settings & API** → create a key, copy it.
3. In Chrome, go to `chrome://extensions`, enable **Developer mode**.
4. Click **Load unpacked** and select this `extension/` folder.
5. Open the extension popup, expand **Connection settings**, paste the API key,
   and **Save settings**.

## Use

- **Popup** (any page): find an email by name + domain, or verify an address.
  Confirmed results can be saved as a lead with one click.
- **LinkedIn**: on a profile page (`linkedin.com/in/…`) a panel appears
  bottom-right, pre-filled with the person's name — enter their company
  domain and find their email.

## Notes

- The default API base is `http://localhost:3000`. To point at a deployed
  instance, change it in the popup settings **and** add that host to
  `host_permissions` in `manifest.json`.
- All API calls go through the background service worker so they carry the
  extension's host permissions instead of the page's CORS context.
