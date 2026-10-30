# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Competitive Honor of Kings Global players and their teams: captains, coaches, analysts, and players who run scrims and
tournaments, plus curious players who browse heroes, items and guides. They use it on a desktop during a team session
(draft, review, tier lists) and on a phone between games (agenda, requests, a hero sheet). Staff (admins, editors)
maintain the catalogue. _Inferred from the repository and the owner's messages, not interviewed._

## Product Purpose

A draft, scrim and tier-list workspace for Honor of Kings Global (not the Chinese client, not Arena of Valor). Run a
draft alone, on one shared device, or online against an invited opponent; keep series history; share series, builds
and tier lists by link; export to JSON or PDF; plan scrims with a team agenda and Discord reminders; train; read
hero guides and game data (items, arcana, battle spells). Success: a team drafts, reviews and plans in one place and
trusts the numbers it sees.

## Positioning

Statistics come only from the team's own scrims, with an honest "Insufficient sample" below a threshold, and the UI
says "Data unavailable" rather than inventing. No ranked data anywhere. A neighbouring wiki or stats site could not
truthfully make that promise.

## Operating Context

Live draft boards (bans, picks, timers, lanes), a hand-entered catalogue (heroes, items with categories and stats,
arcana, battle spells, lanes), team and tournament management, a community layer (guides, combos, official ratings,
ratings board), reflex training, personal space, onboarding, settings. Staff texts are translated automatically.
Imported game data comes from fan sites and must be verified by the owner.

## Capabilities and Constraints

- Vanilla JS client, Express 5 + MySQL 8 server, server-side rendering with hydration.
- 15 languages including right-to-left (Arabic); dark and light themes.
- CSP forbids inline `style` attributes; Lighthouse 100 is the performance target; WCAG AA contrast is tested.
- Builds are not rated; the catalogue is entered by hand by staff.
- Open decision: the arcana colour convention (guide versus the owner's pictures) is unconfirmed.

## Brand Commitments

The product name "HOK Global Scrim Lab" stays. The owner explicitly released the visual identity: logo included, full
creative freedom (2026-10-10). Warmer accent (gold) chosen earlier; the previous mock-up is no longer a contract.
Reference level for craft: https://pvp.qq.com/ (inspire, never copy its assets).

## Evidence on Hand

Hero portraits, item/arcana pictures and spell icons held in the catalogue; the owner's saved pages `items.html`,
`arcana.html`, `spells.html`; `MISSING.md` lists the data still absent. No testimonials, customers, rankings or
prices exist and none may be invented.

## Product Principles

1. Nothing invented: absent data is shown as absent.
2. The team's own scrims are the only source of statistics.
3. A tool for working sessions first: legible at speed, usable one-handed on a phone.
4. Every language and direction is a first-class citizen.
5. Fast by default: the page is useful before scripts run.

## Accessibility & Inclusion

WCAG AA contrast (4.5:1 text) in both themes, visible keyboard focus, right-to-left layouts, no text under 12 px,
reduced-motion respected.
