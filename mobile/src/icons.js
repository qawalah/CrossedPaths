// CrossPaths icon set: one line style for the whole app, matching the app icon.
// 24-unit grid, drawn with a 1.8 stroke, round caps and joins, no fills (except small dots,
// written as fill="currentColor").
// The pin is the app icon's pin; routes are smooth curves, never straight crossed bars.
// The web client carries an identical copy (ICON in server/server/static/index.html):
// change both together.
export const ICON = {
  // The crossing kinds
  pin: '<path d="M12 2.8c-3.6 0-6.4 2.8-6.4 6.4 0 4.8 6.4 12 6.4 12s6.4-7.2 6.4-12c0-3.6-2.8-6.4-6.4-6.4z"/><circle cx="12" cy="9.2" r="2.4"/>',
  crossing: '<path d="M3 17.5c5 0 6.5-3.5 9-5.5s4-5.5 9-5.5"/><path d="M3 6.5c5 0 6.5 3.5 9 5.5s4 5.5 9 5.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  together: '<path d="M3 15c4.5 0 5.5-6 9.5-6S17.5 4 21 4"/><path d="M3 20c4.5 0 5.5-6 9.5-6s5-5 8.5-5"/>',
  // Navigation and tabs
  route: '<path d="M5.5 18.5c4.5 0 3.5-7 6.5-7s2-7 6.5-7"/><circle cx="4.5" cy="18.5" r="1.6"/><circle cx="19.5" cy="4.5" r="1.6"/>',
  upload: '<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 3-5.5 6-5.5s6 2 6 5.5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18.6 20c0-2.2-1-3.8-2.6-4.7"/>',
  checks: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-5"/>',
  account: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c1.1-3.6 3.9-5.4 7.2-5.4s6.1 1.8 7.2 5.4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  prev: '<path d="M14.5 6l-6 6 6 6"/>',
  next: '<path d="M9.5 6l6 6-6 6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  // Actions
  play: '<path d="M8 5.6v12.8c0 .8.9 1.3 1.5.8l9.6-6.4c.6-.4.6-1.2 0-1.6L9.5 4.8C8.9 4.3 8 4.8 8 5.6z"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  filter: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sort: '<path d="M7.5 19V5M4 8.5 7.5 5 11 8.5M16.5 5v14M13 15.5l3.5 3.5 3.5-3.5"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><path d="M12 16.9v.1"/>',
  trash: '<path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.8 11.6a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v5.5M14 11v5.5"/>',
  // Things
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6a1 1 0 0 1 .8.4L11.4 8h7.1a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  photos: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.8 16.5l4.7-4.7 4 4 2.5-2.5 5.2 5.2"/><circle cx="15.5" cy="9" r="1.6"/>',
  map: '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>',
  locate: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  nearby: '<circle cx="12" cy="12" r="1.8"/><path d="M8.4 8.4a5.1 5.1 0 0 0 0 7.2M15.6 8.4a5.1 5.1 0 0 1 0 7.2M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  // Status
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  ok: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-5"/>',
  error: '<circle cx="12" cy="12" r="8.5"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/>',
  warning: '<path d="M10.3 4.6 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><path d="M12 16.8v.1"/>',
};

// The three kinds of crossing, by API name.
export const KIND_ICON = { same_place: "pin", passing: "crossing", shared_route: "together" };

export const iconXml = (name, color, strokeWidth = 1.8) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${(ICON[name] || ICON.pin).replace(/currentColor/g, color)}</svg>`;
