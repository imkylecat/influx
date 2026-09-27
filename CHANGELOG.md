# Changelog

All notable changes to Influx are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- SendConfirmation plugin: asks before sending in selected channels (or all channels), with
  default-on blocking for known honeypot channels.
- LocalNotes plugin: adds a local note action to user menus, with a native editor to save or delete
  private notes. Notes stay on this device and are stored separately for each account.
- SilentTyping adds a keyboard button to the chat bar that turns it on or off. Like the GIF and
  sticker buttons, it's hidden on mobile and in narrow chat bars.
- MessageLogger adds "Remove deleted message" and "Clear edit history" to the message menu, and can
  skip logging for chosen user, channel and server IDs.

### Changed

- MessageLogger makes deleted messages read-only: the hover bar and message menu no longer offer
  replies, reactions, edits, pins or other actions Fluxer's server would reject.

### Fixed

- MessageLogger didn't log your own edits when "Don't log your own messages" was turned off. An edit
  that fails to save is no longer kept in the history.
- The Linux installer didn't find Fluxer installed from the Arch package, which uses `/opt/fluxer`
  rather than `/opt/Fluxer`.
- The Linux installer left `~/.config` owned by root when it had to create it, so Fluxer couldn't
  save its settings.

## [0.2.5] - 2026-09-23

### Changed

- The Plugins tab uses Fluxer's native settings rows, with a Configure button that opens each
  plugin's settings in a modal.
- MessageLinkEmbeds uses Fluxer's forwarded-message frame for previews and a native card with a
  "Jump to message" button when a linked message is unavailable.
- MessageLogger uses Fluxer's failed-message text styling for deleted messages and native edit
  label styling for past edits.
- KeywordNotify and RelationshipNotifier share Fluxer's native notification handler.

## [0.2.4] - 2026-09-23

### Added

- ForceDeveloperMode plugin: turns on Fluxer's developer mode without tapping the build number 7
  times. An option also shows staff-only settings and menus, though Fluxer's server still refuses
  staff actions.
- ForceFlags plugin: forces flags on or off for chosen users (such as the staff or partner badge),
  and features on or off for chosen servers. Only your client sees the change.

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

[Unreleased]: https://github.com/imkylecat/influx/compare/v0.2.5...HEAD
[0.2.5]: https://github.com/imkylecat/influx/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/imkylecat/influx/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/imkylecat/influx/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/imkylecat/influx/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/imkylecat/influx/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/imkylecat/influx/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/imkylecat/influx/releases/tag/v0.1.0
