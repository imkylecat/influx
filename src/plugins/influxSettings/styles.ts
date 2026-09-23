export const STYLES = `
.influx-plugin-list {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-2, 8px);
	margin-top: var(--spacing-3, 12px);
}
.influx-plugin-card {
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-accent);
	border-radius: var(--radius-md, 8px);
	padding: var(--spacing-3, 12px) var(--spacing-4, 16px);
}
.influx-plugin-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 12px;
	margin-top: var(--spacing-2, 8px);
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
	margin-top: var(--spacing-3, 12px);
	padding-top: var(--spacing-3, 12px);
	border-top: 1px solid var(--background-modifier-accent);
}
.influx-updates {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-3, 12px);
}
.influx-update-row {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: var(--spacing-3, 12px);
}
.influx-community-row {
	display: flex;
	align-items: center;
	gap: var(--spacing-3, 12px);
	flex-wrap: wrap;
}
.influx-field-description {
	color: var(--text-primary-muted);
	font-size: 13px;
}
.influx-empty,
.influx-missing-components {
	padding: var(--spacing-6, 24px) 0;
	text-align: center;
	color: var(--text-tertiary);
}
`;
