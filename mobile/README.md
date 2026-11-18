# DSKRISHNA – Android app

An Expo app that opens the live portal (`https://portal.dskrishna.in`, set in `app.json → expo.extra.portalUrl`)
inside a native shell. Every change deployed to the portal shows up in the app straight away: **no new APK is
needed for web changes.** Build a new APK only when this `mobile/` folder changes (icon, name, permissions, shell code).

What the shell adds on top of the website:

| Feature | How |
| --- | --- |
| Camera / gallery for site photos and scans | Android camera permission + WebView file chooser |
| "Use my location" and the plot map | Asks for location permission the first time the page needs it |
| Android back button | Goes back inside the portal; exits only from the first page |
| WhatsApp, phone calls, Google Maps directions, other sites | Open in their own apps / the browser |
| Report → Print | Android print dialog (choose a printer or **Save as PDF**) |
| Activity CSV export, opening attached files | Android share sheet (save to Files, send on WhatsApp, open in a viewer) |
| No internet | "You're offline" screen that reconnects by itself |

The shell code is `App.js`; the script injected into the page is `src/bridge.js`.

## Build an installable APK

```bash
cd mobile
npm install
npx eas-cli login            # once, with the Expo account that owns the project
npx eas-cli build -p android --profile preview
```

The build runs on Expo's servers (about 10–20 minutes). When it finishes, open the link it prints on the phone
and install the `.apk` (Android asks to allow installs from that source once).

For the Google Play Store use the `production` profile, which makes an `.aab`:
`npx eas-cli build -p android --profile production`.

The app's signing key is stored by Expo on the project (`npx eas-cli credentials` to view or download a backup).
Keep using the same Expo project, or updates won't install over the existing app.

## New version of the app

Bump `expo.version` (shown to users) and `expo.android.versionCode` (must go up by 1 every build) in `app.json`,
then build again.

## Try it on a phone during development

```bash
npx expo start
```

The app uses native modules that aren't in Expo Go, so test with the APK from the `preview` build, or a
development build (`npx eas-cli build -p android --profile development` after adding a `development` profile).
