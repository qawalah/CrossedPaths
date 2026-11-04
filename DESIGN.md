---
name: CrossPaths
description: A calm, map-first design language. Deep navy surfaces, one living accent, drawn line icons, and motion that explains instead of decorating.
colors:
  night: "#0b1220"
  night-panel: "#121a2b"
  night-panel-raised: "#18233a"
  night-line: "#25324d"
  night-text: "#e8eefc"
  night-muted: "#8a97b4"
  day: "#f3f5fa"
  day-panel: "#ffffff"
  day-panel-raised: "#eef1f7"
  day-line: "#dbe1ec"
  day-text: "#0f172a"
  day-muted: "#5b6578"
  accent-teal: "#2dd4bf"
  accent-teal-day: "#0d9488"
  accent-teal-ink: "#04222a"
  accent-blue: "#60a5fa"
  accent-blue-day: "#2563eb"
  accent-violet: "#a78bfa"
  accent-violet-day: "#7c3aed"
  accent-amber: "#fbbf24"
  accent-amber-day: "#b45309"
  accent-rose: "#fb7185"
  accent-rose-day: "#e11d48"
  link-blue: "#60a5fa"
  good: "#4ade80"
  good-day: "#15803d"
  warn: "#f59e0b"
  warn-day: "#b45309"
  bad: "#f87171"
  bad-day: "#dc2626"
  route-blue: "#0a84ff"
  route-green: "#34c759"
typography:
  display:
    fontFamily: "IBM Plex Sans Arabic, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.2
  headline:
    fontFamily: "IBM Plex Sans Arabic, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "IBM Plex Sans Arabic, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "IBM Plex Sans Arabic, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Sans Arabic, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "10px"
  md: "12px"
  lg: "16px"
  sheet: "22px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent-teal}"
    textColor: "{colors.accent-teal-ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  button-ghost:
    backgroundColor: "{colors.night-panel-raised}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.lg}"
    padding: "14px"
  chip:
    backgroundColor: "{colors.night-panel-raised}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.pill}"
    padding: "7px 12px"
  chip-selected:
    backgroundColor: "{colors.accent-teal}"
    textColor: "{colors.accent-teal-ink}"
  input:
    backgroundColor: "{colors.night-panel-raised}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "11px 12px"
  tab-bar:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.night-muted}"
    height: "64px"
---

# Design System: CrossPaths

## Overview

**Creative North Star: "Two Paths, One Point"**

The whole system is the app icon: two routes, one blue and one green, drawn toward each other until they meet, and a pin dropping onto the meeting point. Every screen is built around one such moment. There is one main action per screen, the surfaces stay quiet so the map and the data lead, and the single accent colour marks only what you can act on or what is happening now.

The feel is calm, private and precise. It is a tool people use with someone else's trust in it, so it never shouts. Dark navy is the home theme (a light theme is equal, not an afterthought, and the app follows the system). Information is dense where it earns it, such as the date bar and the results, and sparse everywhere else. Motion is used to explain where something came from or what just changed, and the one authored moment, the crossing, is saved for the places that deserve it.

**Key Characteristics:**
- One accent colour, chosen by the user from five, used for action, selection and "something is happening".
- Surfaces are flat, bordered, rounded; depth is a border and a tone step, not a shadow.
- Drawn line icons in one weight; never emoji or text symbols as icons.
- Text is IBM Plex Sans Arabic everywhere, so Arabic and Latin share one voice.
- Motion explains. It is fast on the way out, confident on the way in, and always has a reduced-motion path.
- Works in English and Arabic, left-to-right and right-to-left, with no layout changes beyond direction.

## Colors

A deep navy night palette with a pale day twin, one swappable accent, and a fixed pair of route colours taken from the icon.

### Primary
- **Living Teal** (#2dd4bf night, #0d9488 day): the default accent. Primary buttons, the selected tab, the selected chip, the date bar's cursor and highlighted bars, the pulse rings. Text on it is always the paired ink (#04222a night, white day), never the main text colour.
- The user can switch the accent to **Sky Blue** (#60a5fa / #2563eb), **Soft Violet** (#a78bfa / #7c3aed), **Amber** (#fbbf24 / #b45309) or **Rose** (#fb7185 / #e11d48). Every accent has a dark and a light value and a paired ink. Nothing in the UI may hard-code teal; it reads the current accent.

### Secondary
- **Route Blue** (#0a84ff) and **Route Green** (#34c759): the two routes of the icon. They are brand artwork (the crossing hero, tutorial art, results), not UI chrome. They stay the same in both themes.
- **Link Blue** (#60a5fa night, #2563eb day): links and small secondary actions such as "Add more to this timeline".

### Neutral
- **Night Navy** (#0b1220), **Night Panel** (#121a2b), **Raised Panel** (#18233a): page, card and field/raised surfaces, in that order of height.
- **Night Line** (#25324d): every border and divider. **Night Text** (#e8eefc) and **Night Muted** (#8a97b4) for text.
- **Day Mist** (#f3f5fa), **Day Panel** (#ffffff), **Day Raised** (#eef1f7), **Day Line** (#dbe1ec), **Day Text** (#0f172a), **Day Muted** (#5b6578): the light twin, same roles.
- Status colours: **Good** (#4ade80 / #15803d), **Warn** (#f59e0b / #b45309), **Bad** (#f87171 / #dc2626). Each also has a tinted background, a border and a text tone for banners.

### Named Rules
**The One Voice Rule.** The accent appears on at most a few things per screen: the main action, the current selection, and live activity. If everything is teal, nothing is.

**The Read-The-Theme Rule.** Colours are never captured at build time. In the mobile app `colors` is one shared object that is rewritten when the theme or accent changes; on the web the values are CSS variables. Never freeze a colour into a stylesheet created once.

**The Ink Rule.** Text on an accent fill uses the accent's own ink, so contrast holds for all five accents in both themes.

## Typography

**Display Font:** IBM Plex Sans Arabic (SIL OFL 1.1), falling back to the system UI font
**Body Font:** the same
**Label Font:** the same

**Character:** one humanist family that covers Arabic and Latin, so the two scripts look like siblings instead of a patched pair. Weight, not a second font, carries hierarchy.

### Hierarchy
- **Display** (800, 28px, 1.2): the first-start tutorial titles.
- **Headline** (800, 24px, 1.2): screen titles (Import, Checks, My map, Account) and the Checks call to action.
- **Title** (700, 16px): card and section titles, the sheet headings.
- **Body** (400, 15px, 1.45): running text. Secondary text is Muted, 13px, line height about 1.5.
- **Label** (600, 12.5px): chips, pills, small captions, bar labels. Tab labels are 12px (700 when selected).

On Android a bundled face is chosen by file name and ignores `fontWeight`, so weight maps to a file (400, 500, 600, 700; anything heavier uses Bold). Use the app's `Text` and `TextInput` wrappers, never the bare React Native ones.

### Named Rules
**The One Family Rule.** Do not add a second typeface. Numbers use tabular figures where they line up in tables.

## Layout

A single column on phones, centred at about 720px on wide screens (the web caps the page at 720px, with a 16px gutter). Screens scroll; the tab bar and a pinned action bar (when a screen has a main button) stay on screen. Spacing is a 4px base: 4, 8, 12, 16, 20. Cards sit 6 to 10px apart; the page gutter is 16px and full-screen modals use 20px.

The tab bar is five tabs with the main action in the middle: **Import, My Map, Checks (raised), People, Account**. Anything that must never be pushed off screen, such as "Choose file(s)" under a long list, lives in a footer that stays put while the content scrolls.

## Elevation & Depth

Flat by default. Depth is shown with a one-pixel border and a step in tone (page, panel, raised), not with shadows. A shadow appears only on things that float: the raised Checks button, the bubble above the date bar, and toasts. Those use a soft, offset shadow (about `0 6px 16px` at 14 to 35% black); never a hard offset shadow or a coloured glow.

### Named Rules
**The Border-Or-Shadow Rule.** A surface declares its elevation once: a border for resting surfaces, a shadow for floating ones. Never both on the same surface.

## Shapes

Soft, continuous rounding. **10px** small buttons and chips-in-rows, **12px** buttons, fields, segmented controls, **16px** cards and the map card, **22px** the top corners of bottom sheets, **pill (99px)** for chips, status pills and the date bar's breadcrumbs. The raised Checks button, avatars and the pulse are circles. Icons are drawn on a 24-unit grid with a **1.8** stroke, round caps and joins, and no fills except tiny dots; the pin is the app icon's pin, and routes are smooth curves, never straight crossed bars.

## Components

### Buttons
- **Shape:** 12px radius (10px for the small size), 12px by 16px padding, label 700 at 15px.
- **Primary:** accent fill with the accent's ink text. **Ghost:** raised-panel fill, a 1px line border, normal text. **Bad:** the tinted red fill with a red border and red text, used only for destructive actions such as Sign out and Delete.
- **Pressed:** scales to 0.97. **Disabled:** 50% opacity. A busy button shows a spinner and keeps its width.

### Chips and segmented controls
- **Chip:** pill, raised-panel fill, 1.5px line border, 13px 600. **Selected:** accent fill and ink text.
- **Segmented control:** a raised track with a lighter sliding thumb under the active label. The thumb animates, it does not jump.

### Cards and rows
- **Card:** panel fill, 1px line border, 16px radius, 14px padding. No cards inside cards.
- **Expandable row** (previous checks): a short summary line with a chevron; tapping opens the details and actions with a smooth height change and a turning chevron. Open rows get the accent border.

### Inputs
- Raised-panel fill, 1px line border, 12px radius. **Focus:** the border becomes the accent. Date pickers use the same field look.

### Navigation: the tab bar
- Five tabs, 64px tall with the safe-area inset. The selected tab has an accent pill (60 by 32, 17% accent) that **slides and slightly stretches** to it, and its icon pops once. **Checks** is a raised round button (about 56px) in the middle that carries the app icon. When a check is ready to run, it **pulses** (see Motion). While Checks is open, the sliding pill steps aside because the raised button shows the selection.

### Signature: the crossing
- The app icon, animated. The blue and green routes draw in from opposite sides and cross, a pale halo spreads, and the pin drops onto the meeting point with a small bounce. It plays when the Checks tab opens and as the first tutorial card. It is also the empty state of the Checks tab and is tappable: it does the next sensible thing (ask a connection, review a request, import, connect).

### Signature: the date bar
- A seek bar for picking a day, like a video scrubber. Drag to move through years; slide up (or hold still, per setting) to zoom into months and then days; slide down to zoom out; let go to open the nearest day with data. Bars show points per day on a log scale; a bubble above the finger shows the level, the date and the count; breadcrumb pills (All / year / month) jump levels.

### Signature: the first-start tutorial
- Full-screen swipeable cards: the crossing, Import, Connect, Check together, See where you crossed. Each has a small animation that restarts when its card becomes current; the picture moves further than the text as you swipe. Skip is always available. It is shown once and can be replayed from Account.

## Motion

Motion explains state, relationship and hierarchy. It is not decoration.

- **Easing:** arrivals use `cubic-bezier(0.16, 1, 0.3, 1)` (fast start, long soft landing). Exits use `cubic-bezier(0.4, 0, 1, 1)` and are shorter than the entrance. No bounce or elastic by reflex; the only springs are the small "pop" of a chosen tab icon and a completed step.
- **Durations:** 100 to 180 ms for feedback, 300 to 380 ms for a page or panel change, about 480 ms for the tab pill's travel, 1.0 s for the routes of the crossing drawing in. Long feedback feels like lag.
- **Page change between tabs:** the old page slips out about 18px against the direction of travel in 100 ms; the new page slides in from about 36px on the side of the tab you chose, in 340 to 380 ms. Left and right therefore always mean something. Full pages rise in about 28px; sheets slide up from the bottom.
- **Invitation pulse:** when the main action is available, two rings expand from the centre (scale 0.8 to 2.1, fading, 2.4 s, the second 1.2 s behind) while the icon breathes (1.0 to 1.1 over 2.4 s). It stops the moment the action is taken or unavailable. It must stay calm: one pulse on screen at a time.
- **Reduced motion:** honour the system setting everywhere. Movement and loops stop; opacity changes and state changes remain, so feedback is still readable. The pulse becomes one still ring.
- Animate `transform` and `opacity`; avoid animating layout properties. Looping animations stop when off screen.

## Language and direction

The app is fully English and Arabic. English text is the translation key, and the Arabic file maps it; a missing entry falls back to English. Use logical start and end, not left and right, so right-to-left needs no special cases. Numbers and dates follow the locale. The layout direction applies at the next start on Android; the text language applies at once.

## Do's and Don'ts

### Do:
- **Do** give each screen one main action and let the accent point at it.
- **Do** read colours from the current theme and accent; keep dark and light equal.
- **Do** use the drawn icon set at 1.8 stroke; add new icons in the same language (smooth curves, round caps, no fills).
- **Do** keep a screen's main button pinned where long content could push it off screen.
- **Do** explain a change with motion (where it came from, what moved) and give it a reduced-motion form.
- **Do** write the product's own plain language: buttons name their action ("Choose file(s)", "Run a check"), errors name the problem and the fix.
- **Do** keep privacy promises visible where they apply (who sees what, how long it is kept).

### Don't:
- **Don't** use emoji or text symbols as icons.
- **Don't** put a card inside a card, or use gradient text, decorative blur or glass.
- **Don't** use a hard offset shadow or a coloured glow; and never a border and a shadow on the same surface.
- **Don't** hard-code the accent colour or capture theme colours at build time.
- **Don't** add a second typeface.
- **Don't** let a looping animation run with reduced motion on, or let two pulses compete on one screen.
- **Don't** open a modal for something that needs neither interruption nor focus.
- **Don't** repeat a choice in two places on one screen (for example two switches for the same pair of options).
