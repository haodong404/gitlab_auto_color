# GitLab Auto Color

A Chrome extension that automatically syncs your GitLab theme preferences whenever
the OS switches between light and dark mode.

Confirmed working on **GitLab Community Edition 15.8.1**.

## Why this exists

Older self-hosted GitLab versions (roughly pre-16.x) lack the built-in "Auto"
appearance option that follows the OS. If your company runs one of those versions
you are stuck manually changing two fields every time you switch environments:

- **Color Theme** (`user[theme_id]`) — the navigation sidebar color
- **Syntax Highlighting Theme** (`user[color_scheme_id]`) — the code editor color scheme

This extension watches for OS dark/light mode changes, opens the GitLab preferences
page in a hidden background tab, selects the radio buttons you configured, saves the
form, then reloads your open GitLab tabs so the new theme is reflected immediately —
all without you touching anything.

## Features

- Detects OS dark/light mode changes via `prefers-color-scheme`
- Applies your preset in a hidden background tab and closes it automatically
- Reloads open GitLab tabs so the new theme takes effect right away
- Configurable GitLab domain — works with any self-hosted instance
- Changing the domain re-registers content scripts on the fly, no reinstall needed
- Console logs on every GitLab page so you can confirm the extension is active

## Installation

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select this directory

## Setup

1. Click the extension icon → **Options**
	(or go to `chrome://extensions` → Details → Extension options)
2. Set your **GitLab Domain** (e.g. `git.company.com`)
3. Choose your preferred **Color Theme** and **Syntax Highlighting Theme**
	for dark mode and for light mode
4. Check **Auto-save** if you want the form to be submitted automatically
5. Click **Save settings**

That's it. Every subsequent OS appearance change triggers a silent background sync.

## Verifying it works

1. Reload the extension in `chrome://extensions`
2. Open any page on your GitLab instance
3. Open DevTools → Console
4. You should see a line like:
	```
	[GitLab Auto Color] init: dark @ ...
	```
5. Toggle your OS appearance — you should then see:
	```
	[GitLab Auto Color] system-theme-changed: dark -> light @ ...
	```

If the log appears but the theme doesn't change, open the preferences page and
check the `[GitLab Auto Color][preferences]` log prefix:

| Log message | Meaning |
|---|---|
| `apply preset start: ...` | Applying has started |
| `radio set: name=... value=...` | A radio button was successfully changed |
| `radio already checked: ...` | The target theme was already active (no change needed) |
| `radio not found: ...` | Radio button not found — page structure may differ |
| `save triggered via ...` | The save button was clicked |

You can also check the Service Worker console for `[GitLab Auto Color][background]` logs:

| Log message | Meaning |
|---|---|
| `apply start for mode=...` | Background sync started |
| `content scripts registered for domain: ...` | Scripts re-registered after a domain change |
| `apply result from preferences page ...` | Result returned from the preferences tab |
| `reloaded ... tabs to reflect updated theme` | Open GitLab tabs were refreshed |

## Troubleshooting

### Errors about `web_accessible_resources` / `assets/*.js` / `content_script.js-loader`

Errors like `Denying load of chrome-extension://.../assets/utils-xxxx.js` come from
a **different** bundled extension (typically built with Vite/WXT), not this one.
This project contains only plain JS files and never loads `assets/*.js`:

```
manifest.json  background.js  content.js  logger.js  options.html  options.js
```

Fix: disable or remove the conflicting extension, then reload this one.

### Theme still not changing

1. Click **Apply now** in the options page to trigger a manual sync
2. Make sure you are logged in and the preferences page is not restricted by an admin policy
3. Check the Service Worker console for errors under `[GitLab Auto Color][background]`
