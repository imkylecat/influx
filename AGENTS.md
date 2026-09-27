Influx is a high-performance, patch-based mod for the Fluxer instant messaging application.

When developing plugins, use native Fluxer components wherever possible. Avoid raw CSS and custom components when an existing native component can serve the same purpose. Reusing native components keeps plugins visually and behaviorally consistent with Fluxer and the rest of Influx.

Where possible, plugins should include a `stop()` method that cleans up their effects so they can be disabled without reloading the app. Plugins that use startup patches still require a reload to remove those patches.

Write all text, such as plugin descriptions, settings labels, and docs, in US English. Keep sentences short and direct, and don't repeat yourself. Avoid technical jargon in text that general users will see.

We use Oxfmt for formatting and Oxlint for linting. After making changes, run `bun run lint` to verify the codebase, then `bun run fmt` to format it.

Always format Git commit messages as `feat(scope): description`, using a scope that identifies the affected area and a concise description of the change. For example: `feat(plugins): add message link previews`.
