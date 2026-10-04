const LAYOUT =
  '[class*="GuildsLayout.module__guildsLayoutContainer___"]:has(> .influx-folder-sidebar';

export const STYLES = `
@property --influx-folder-sidebar-width {
	syntax: "<length>";
	inherits: true;
	initial-value: 0px;
}
${LAYOUT}) {
	--influx-folder-sidebar-width: 0px;
	grid-template-columns: var(--layout-guild-list-width) var(--influx-folder-sidebar-width) minmax(0, 1fr);
}
${LAYOUT}[data-open="true"]) {
	--influx-folder-sidebar-width: var(--layout-guild-list-width);
}
${LAYOUT}[data-animate="true"]) {
	transition: --influx-folder-sidebar-width 0.2s linear;
}
${LAYOUT}) > .influx-folder-sidebar {
	grid-area: 1 / 2;
	width: var(--influx-folder-sidebar-width);
	overflow: hidden;
}
${LAYOUT}) > [class*="GuildsLayout.module__contentContainer___"] {
	grid-area: 1 / 3;
}
${LAYOUT}) > [class*="GuildsLayout.module__userAreaWrapper___"] {
	width: calc(var(--layout-guild-list-width) + var(--influx-folder-sidebar-width) + var(--layout-sidebar-width) + 0.0625rem);
}
`;
