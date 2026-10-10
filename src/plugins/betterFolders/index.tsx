import definePlugin from "@api/Plugins";
import { definePluginSettings, onSettingsChange } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { Contributor } from "@utils/constants";
import { Components, nativeClasses, observable, React, reaction, Stores } from "@webpack/common";
import type { ComponentType } from "react";

import STYLES from "./styles.css" with { type: "text" };

const settings = definePluginSettings({
  sidebar: {
    type: "boolean",
    description: "Display servers from folder on dedicated sidebar.",
    default: true,
  },
  sidebarAnimation: {
    type: "boolean",
    description: "Animate opening the folder sidebar.",
    default: true,
  },
  closeAllFolders: {
    type: "boolean",
    description: "Close all folders when selecting a server not in a folder.",
    default: false,
  },
  closeAllHomeButton: {
    type: "boolean",
    description: "Close all folders when clicking on the home button.",
    default: false,
  },
  closeOthers: {
    type: "boolean",
    description: "Close other folders when opening a folder.",
    default: false,
  },
  closeServerFolder: {
    type: "boolean",
    description: "Close folder when selecting a server in that folder.",
    default: false,
  },
  forceOpen: {
    type: "boolean",
    description: "Force a folder to open when switching to a server of that folder.",
    default: false,
  },
  keepIcons: {
    type: "boolean",
    description:
      "Keep showing server icons in the primary server bar folder when it's open in the BetterFolders sidebar.",
    default: false,
  },
  showFolderIcon: {
    type: "select",
    description: "Show the folder icon above the folder servers in the BetterFolders sidebar.",
    options: [
      { label: "Never", value: "never" },
      { label: "Always", value: "always" },
      { label: "When more than one folder is expanded", value: "moreThanOne" },
    ],
    default: "always",
  },
});

interface ExpandedFolders {
  expandedFolderIds: number[];
  toggleExpanded(folderId: number): void;
}

interface FolderProps {
  folder: { id: number | null };
  registerScrollTarget: unknown;
  influxFolderIcon?: boolean;
}

interface OpenFolder {
  FolderItem: ComponentType<FolderProps>;
  props: FolderProps;
}

const STYLE_ID = "influx-better-folders";
const NO_FOLDER = -1;

let expandedFolders: ExpandedFolders | undefined;
const openFolders: OpenFolder[] = [];
let lastGuildId: string | null = null;
let closingFolders = false;

let settingsVersion: { get(): number; set(value: number): void } | undefined;
const settingsChanges = () => (settingsVersion ??= observable()?.box(0));

function usesSidebar(): boolean {
  settingsChanges()?.get();
  return settings.store.sidebar && !Stores.MobileLayout()?.enabled;
}

function closeFolders(keep?: number): void {
  if (!expandedFolders) return;
  closingFolders = true;
  try {
    for (const id of expandedFolders.expandedFolderIds.filter((id) => id !== keep)) {
      expandedFolders.toggleExpanded(id);
    }
  } finally {
    closingFolders = false;
  }
}

export function onFoldersChange(open: number[], previous: number[]): void {
  if (closingFolders || !settings.store.closeOthers) return;
  const toggled = [
    ...open.filter((id) => !previous.includes(id)),
    ...previous.filter((id) => !open.includes(id)),
  ];
  if (toggled.length === 1 && open.length > 1) closeFolders(toggled[0]);
}

export function onNavigate(navigationGuildId: string | null | undefined): void {
  const { closeAllFolders, closeServerFolder, forceOpen } = settings.store;
  if (!expandedFolders || (!closeAllFolders && !closeServerFolder && !forceOpen)) return;
  const guildId =
    !navigationGuildId || navigationGuildId.startsWith("@") ? null : navigationGuildId;
  if (guildId === lastGuildId) return;
  lastGuildId = guildId;
  if (guildId && !Stores.Guilds()?.getGuild(guildId)) return;
  const folder = Stores.UserSettings()?.guildFolders.find(
    ({ id, guildIds }) => id !== NO_FOLDER && guildId && guildIds.includes(guildId),
  );
  if (!folder) {
    if (closeAllFolders) closeFolders();
    return;
  }
  const folderId = folder.id ?? NO_FOLDER;
  const wasExpanded = expandedFolders.expandedFolderIds.includes(folderId);
  if (forceOpen && !wasExpanded) expandedFolders.toggleExpanded(folderId);
  if (closeServerFolder && wasExpanded) expandedFolders.toggleExpanded(folderId);
}

function FolderSidebar({ folders }: { folders: OpenFolder[] }) {
  const { showFolderIcon, sidebarAnimation } = settings.store;
  const folderIcon =
    showFolderIcon === "always" || (showFolderIcon === "moreThanOne" && folders.length > 1);
  const Scroller = Components.Scroller();
  const content = (
    <div className={nativeClasses("GuildsLayout.module__guildListContent___")}>
      {folders.map(({ FolderItem, props }) => (
        <div
          key={`${props.folder.id}`}
          className={nativeClasses("GuildsLayout.module__guildListItemSlot___")}
        >
          <FolderItem {...props} registerScrollTarget={null} influxFolderIcon={folderIcon} />
        </div>
      ))}
    </div>
  );
  return (
    <nav
      className={`influx-folder-sidebar ${nativeClasses("GuildsLayout.module__guildListScrollerWrapper___")}`}
      aria-label="Open folders"
      data-open={folders.length > 0}
      data-animate={sidebarAnimation}
    >
      {Scroller ? (
        <Scroller
          className={nativeClasses("GuildsLayout.module__guildListScrollContainer___")}
          showTrack={false}
        >
          {content}
        </Scroller>
      ) : (
        content
      )}
    </nav>
  );
}

let stopWatching: Array<(() => void) | undefined> = [];

export default definePlugin({
  name: "BetterFolders",
  description: "Shows server folders on dedicated sidebar and adds folder related improvements.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: '"GuildFolderExpanded"',
      replacement: {
        match: /\(this,(?="GuildFolderExpanded",)/,
        replace: "($self.watch(this),",
      },
    },
    {
      find: '"app.guilds-layout.render-guild-navigation-row.guild-folder-item"',
      replacement: [
        {
          match:
            /\(0,\i\.jsx\)\((\i),(\{folder:\i\.folder,guilds:\i\.guilds,[^}]*"data-flx":"app\.guilds-layout\.render-guild-navigation-row\.guild-folder-item"\})\)/,
          replace: "$self.renderFolder($1,$2)",
        },
        {
          match:
            /\(0,\i\.jsxs\)\("nav",\{className:\i\.\i,"aria-label":[^,]+,"data-flx":"app\.guilds-layout\.guild-list\.guild-list-scroller-wrapper",.{0,3000}?"data-flx":"app\.guilds-layout\.guild-list\.guild-scroll-indicators"\}\)\]\}\)/,
          replace: "($self.withSidebar($&))",
        },
      ],
    },
    {
      find: '"app.sidebar-nav.guild-folder-item.folder-container"',
      replacement: [
        {
          match:
            /(registerScrollTarget:\i\}=(\i),.{0,120}?)(\i)=(\i(?:\.\i)?\.isExpanded\(null==\(\i=\i\.id\)\?-1:\i\))/,
          replace: "$1influxView=$self.folderView($2,$4),$3=influxView.expanded",
        },
        {
          match:
            /(?<![\w$])(\i)\?(?=\(0,\i\.jsx\)\(\i,.{0,40}?className:\i\.\i,from:.{0,120}?"data-flx":"app\.sidebar-nav\.guild-folder-item\.render-expanded-folder-background\.expanded-folder-background")/,
          replace: "influxView.folderIcon&&$1?",
        },
        {
          match:
            /\(0,\i\.jsx\)\(\i\.\i,\{position:"right",maxWidth:"xl",size:"large",text:\(\)=>\(0,\i\.jsx\)\("flx-app-guild-folder-item-tooltip"/,
          replace: "influxView.folderIcon&&$&",
        },
        {
          match:
            /(?<![\w$])\i\?(?=\(0,\i\.jsx\)\(\i,.{0,40}?className:\i\.\i,from:.{0,120}?"data-flx":"app\.sidebar-nav\.guild-folder-item\.render-expanded-guilds\.expanded-guilds")/,
          replace: "influxView.guilds?",
        },
      ],
    },
    {
      find: '"app.sidebar-nav.fluxer-button.fluxer-button.select"',
      replacement: {
        match:
          /(?<=onClick:\(\)=>\{)(?=[^{}]{0,200}\},onContextMenu:\i,ref:\i,"data-flx":"app\.sidebar-nav\.fluxer-button\.fluxer-button\.select")/,
        replace: "$self.onHomeClick();",
      },
    },
  ],

  watch(folders: ExpandedFolders): ExpandedFolders {
    expandedFolders = folders;
    stopWatching.push(
      reaction()?.(() => [...folders.expandedFolderIds], onFoldersChange),
      reaction()?.(() => Stores.Navigation()?.guildId, onNavigate),
      reaction()?.(
        () => Stores.Authentication()?.isAuthenticated,
        (signedIn) => {
          if (!signedIn) closeFolders();
        },
      ),
    );
    return folders;
  },

  onHomeClick() {
    if (settings.store.closeAllHomeButton) closeFolders();
  },

  renderFolder(FolderItem: ComponentType<FolderProps>, props: FolderProps) {
    const open = expandedFolders?.expandedFolderIds.includes(props.folder.id ?? NO_FOLDER);
    if (open && usesSidebar()) openFolders.push({ FolderItem, props });
    return <FolderItem {...props} />;
  },

  withSidebar(serverList: JSX.Element) {
    const folders = openFolders.splice(0);
    return (
      <>
        {serverList}
        {usesSidebar() && <FolderSidebar folders={folders} />}
      </>
    );
  },

  folderView({ influxFolderIcon }: FolderProps, expanded: boolean) {
    if (influxFolderIcon !== undefined) {
      return { expanded, folderIcon: influxFolderIcon, guilds: expanded };
    }
    const moved = expanded && usesSidebar();
    return {
      expanded: expanded && !(moved && settings.store.keepIcons),
      folderIcon: true,
      guilds: expanded && !moved,
    };
  },

  start() {
    enableStyle(STYLE_ID, STYLES);
    stopWatching.push(
      onSettingsChange(() => {
        const changes = settingsChanges();
        changes?.set(changes.get() + 1);
      }),
    );
  },

  stop() {
    disableStyle(STYLE_ID);
    for (const stop of stopWatching) stop?.();
    stopWatching = [];
  },
});
