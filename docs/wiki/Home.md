# Exporting your location history

Pick where your history is. Each guide shows every screen with the button to press circled.

| Source | You get | Guide |
|---|---|---|
| Google Maps Timeline | `.json` | [Google Maps](Google-Maps.md) |
| Strava | `.zip` / GPX | [Strava](Strava.md) |
| Apple Health | `export.zip` | [Apple Health](Apple-Health.md) |
| Samsung Health | `.zip` | [Samsung Health](Samsung-Health.md) |
| Garmin | `.zip` / FIT / GPX | [Garmin](Garmin.md) |
| Fitbit / Google Fit | TCX / `.zip` | [Fitbit and Google Fit](Fitbit-Google-Fit.md) |
| Swarm | `.zip` | [Swarm](Swarm.md) |
| Photos | nothing to export | [Photos](Photos.md) |
| Anything else | GPX, KML, GeoJSON, FIT, CSV | [Other apps](Other-Apps.md) |

Then: [Uploading to CrossPaths](Upload.md).

*Maintainers:* the step pictures are drawn by `tools/render.js` from `tools/steps.js`. Edit the steps there and run `node docs/wiki/tools/render.js` (needs Playwright). Keep the text in step with `SOURCES` in `server/server/static/index.html` and `mobile/src/importSources.js`.
