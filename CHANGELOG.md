# Changelog

All notable changes to Influx are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.3] - 2026-09-23

### Added

- KeywordNotify plugin: notifies you when a message in a server contains words you choose, and
  highlights matching messages in chat the way mentions are highlighted. Supports whole-word,
  case-sensitive and regular-expression matching. In servers over 250 members, Fluxer only sends new
  messages for the server you have open, so notifications from other large servers can't arrive.
- NoBlockedMessages plugin: hides messages from people you blocked, instead of collapsing them into
  "blocked messages". It can also hide replies to them.
- ShowMeYourName plugin: shows usernames next to display names and nicknames in chat, optionally
  with the discriminator. Follows streamer mode.

## [0.2.2] - 2026-09-23

### Added

- The Influx settings tab shows Fluxer's invite card for the Influx server.

### Changed

- Influx now uses Fluxer's own components instead of custom ones, so it looks and behaves like the
  rest of Fluxer:
  - MessageLinkEmbeds previews linked messages with Fluxer's message preview (avatar, name colour,
    attachments and embeds). Click the author's name to jump to the message.
  - The Plugins tab uses Fluxer's empty state and expandable sections for plugin settings.
  - Update and community buttons sit in the settings section header, and links open through Fluxer.
  - MessageLogger shows the time of past edits in Fluxer's tooltip.
- RelationshipNotifier falls back to a toast when Fluxer's banner can't be found.

### Removed

- MessageLinkEmbeds' "Show images" setting. The native preview shows attachments itself.
- RelationshipNotifier's custom fallback banner.

## [0.2.1] - 2026-09-23

### Fixed

- The desktop build looked for its files at the path of the machine that built it, instead of where
  Influx is installed.

## [0.2.0] - 2026-09-23

### Added

- AnonymiseFileNames plugin: renames files you upload so their original names aren't shared.
- MessageLinkEmbeds plugin: previews the message behind Fluxer message links.
- MessageLogger plugin: keeps deleted messages visible and shows the edit history of messages.
- RelationshipNotifier plugin: notifies you when a friend removes you, a friend request is cancelled
  or you're removed from a server, including while Fluxer was closed.
- The Plugins tab can search plugins, filter them (the filter is remembered), and change each
  plugin's settings. It marks required plugins and offers a reload when a change needs one.

### Changed

- Influx is built with Bun's bundler instead of esbuild.
- Updated Electron and TypeScript.

## [0.1.0] - 2026-09-22

### Added

- Patch-based plugin system for Fluxer's web and desktop clients.
- Desktop installer for macOS, Windows and Linux, and a browser extension.
- Automatic updates for the desktop version.
- Influx settings category with Plugins and Updates tabs, and the Influx version in Fluxer's build
  info.
- ContributorBadges plugin: shows an Influx Contributor badge on contributors' profiles.
- ForceOwnerCrown plugin: shows the server owner's crown even in servers that hide it.
- SilentTyping plugin: stops Fluxer from telling others that you're typing.

[Unreleased]: https://github.com/imkylecat/influx/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/imkylecat/influx/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/imkylecat/influx/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/imkylecat/influx/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/imkylecat/influx/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/imkylecat/influx/releases/tag/v0.1.0
