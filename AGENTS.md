Influx is a high-performance, patch-based mod for the Fluxer instant messaging application.

Only do what is asked. Don't add features, refactor code, or make changes beyond the request.

When developing plugins, use native Fluxer components wherever possible. Avoid raw CSS and custom components when an existing native component can serve the same purpose. Reusing native components keeps plugins visually and behaviorally consistent with Fluxer and the rest of Influx.

Get native components straight from `Components` in `@webpack/common`, for example `const Button = Components.Button();`. Don't wrap them in local maps, aliases, or helper hooks. If a component is missing, add it to `Components` instead.

Where possible, plugins should include a `stop()` method that cleans up their effects so they can be disabled without reloading the app. Plugins that use startup patches still require a reload to remove those patches.

Don't add code comments unless the code is complex enough to need one.

Don't write functions that only call another function, or only get or set a value such as a component. Use the original function or value directly.

Write all text, such as plugin descriptions, settings labels, and docs, in US English. Keep sentences short and direct, and don't repeat yourself. Avoid technical jargon in text that general users will see.

Don't abbreviate words when possible. For example, use `message` instead of `msg`.

We use Oxfmt for formatting and Oxlint for linting. After making changes, run `bun run lint` to verify the codebase, then `bun run fmt` to format it.

Always format Git commit messages as `feat(scope): description`, using a scope that identifies the affected area and a concise description of the change. For example: `feat(plugins): add message link previews`.
