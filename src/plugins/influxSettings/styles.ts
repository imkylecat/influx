// Most of the settings UI borrows Fluxer's own classes; these cover what has no native equivalent.
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
.influx-plugin-actions {
	gap: var(--spacing-3, 12px);
}
.influx-badge-warning {
	background: var(--status-warning, #f0b232);
	color: #000;
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
.influx-missing-components {
	padding: var(--spacing-6, 24px) 0;
	text-align: center;
	color: var(--text-tertiary);
}
`;
