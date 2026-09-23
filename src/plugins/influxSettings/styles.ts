export const STYLES = `
.influx-plugin-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: var(--spacing-2, 8px);
}
.influx-plugin-search {
	flex: 1 1 240px;
	min-width: 0;
}
.influx-plugin-filter {
	flex: 0 0 220px;
}
.influx-plugin-list {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: var(--spacing-3, 12px);
	margin-top: var(--spacing-3, 12px);
}
.influx-plugin-card {
	display: flex;
	flex-direction: column;
	min-width: 0;
	background: var(--background-secondary-alt);
	border-radius: var(--radius-md, 8px);
	padding: var(--spacing-3, 12px) var(--spacing-4, 16px);
}
.influx-plugin-card-expanded {
	grid-column: 1 / -1;
}
.influx-plugin-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--spacing-3, 12px);
}
.influx-plugin-title {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-width: 0;
}
.influx-plugin-name {
	color: var(--text-primary);
	font-size: 16px;
	font-weight: 600;
	overflow-wrap: anywhere;
}
.influx-tag {
	padding: 1px 6px;
	border-radius: 4px;
	background: var(--background-modifier-accent);
	color: var(--text-tertiary);
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.02em;
}
.influx-tag-warning {
	background: color-mix(in srgb, var(--status-warning, #f0b232) 20%, transparent);
	color: var(--status-warning, #f0b232);
}
.influx-plugin-description {
	flex: 1;
	margin: 6px 0 0;
	color: var(--text-primary-muted, var(--text-tertiary));
	font-size: 14px;
	line-height: 1.4;
}
.influx-plugin-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 4px 12px;
	margin-top: var(--spacing-3, 12px);
	color: var(--text-tertiary);
	font-size: 12px;
}
.influx-author {
	padding: 0;
	border: 0;
	background: none;
	color: var(--text-link);
	font: inherit;
	cursor: pointer;
}
.influx-author:hover {
	text-decoration: underline;
}
.influx-plugin-options {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-3, 12px);
}
.influx-updates {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-3, 12px);
}
.influx-missing-components {
	padding: var(--spacing-6, 24px) 0;
	text-align: center;
	color: var(--text-tertiary);
}
`;
