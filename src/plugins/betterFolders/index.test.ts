import { beforeEach, describe, it, spyOn } from "bun:test";
import assert from "node:assert/strict";

import { Stores } from "@webpack/common";

import betterFolders, { onFoldersChange, onNavigate } from ".";
import { compile, pendingFor, resetPatching, runPatched } from "../../renderer/patcher/testing";

beforeEach(() => resetPatching(betterFolders));

// Fluxer's store of open folders, with the toggle it ships.
function openFolders(...expandedFolderIds: number[]) {
  return {
    expandedFolderIds,
    toggleExpanded(id: number) {
      const index = this.expandedFolderIds.indexOf(id);
      if (index === -1) this.expandedFolderIds.push(id);
      else this.expandedFolderIds.splice(index, 1);
    },
  };
}

describe("BetterFolders", () => {
  const store = betterFolders.settings.store;
  beforeEach(() => {
    store.sidebar = true;
    store.keepIcons = false;
    store.closeOthers = false;
    store.closeServerFolder = false;
    store.forceOpen = false;
    store.closeAllFolders = false;
    store.closeAllHomeButton = false;
  });

  const jsx = "{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}";

  it("draws folders itself and adds the sidebar after the server list", () => {
    // Shape of Fluxer's server list, trimmed to a folder row and the unread indicators.
    const listModule = compile(
      `function(e,t,n){const o=${jsx},_6="Folder",jy="Indicators",de={Dt:"list"};` +
        'e.exports=t=>{return(0,o.jsxs)("nav",{className:de.Dt,"aria-label":"Servers","data-flx":"app.guilds-layout.guild-list.guild-list-scroller-wrapper",children:[' +
        '(0,o.jsx)(_6,{folder:t.folder,guilds:t.guilds,isSelected:!1,"data-flx":"app.guilds-layout.render-guild-navigation-row.guild-folder-item"}),' +
        '(0,o.jsx)(jy,{label:"New","data-flx":"app.guilds-layout.guild-list.guild-scroll-indicators"})]})}}',
    );
    const drawn: unknown[][] = [];
    const renderFolder = spyOn(betterFolders, "renderFolder").mockImplementation(
      (...values: unknown[]) => (drawn.push(values), "folder" as any),
    );
    const withSidebar = spyOn(betterFolders, "withSidebar").mockImplementation(
      (serverList) => ({ serverList }) as any,
    );
    try {
      const render = runPatched(pendingFor(betterFolders), listModule);
      const { serverList } = render({ folder: { id: 1 }, guilds: ["200"] });
      assert.equal(drawn[0][0], "Folder");
      assert.deepEqual(drawn[0][1], {
        folder: { id: 1 },
        guilds: ["200"],
        isSelected: false,
        "data-flx": "app.guilds-layout.render-guild-navigation-row.guild-folder-item",
      });
      assert.equal(serverList.type, "nav");
      assert.equal(serverList.props.children[0], "folder");
      assert.equal(serverList.props.children[1].type, "Indicators");
    } finally {
      renderFolder.mockRestore();
      withSidebar.mockRestore();
    }
  });

  it("lets the plugin decide a folder's open look, folder icon, background, and servers", () => {
    // Shape of Fluxer's folder component, trimmed to its folder icon and its servers.
    const folderModule = compile(
      `function(e,t,n){const o=${jsx},_b={isExpanded:e=>1===e},eA={m_:"Tooltip"},_K="Background",_Y="Servers",xD={k9:"background",QD:"servers"};` +
        "e.exports=e=>{var t;let{folder:l,guilds:r,registerScrollTarget:v}=e,b=0,y=_b.isExpanded(null==(t=l.id)?-1:t);" +
        'return[y,function(){return y?(0,o.jsx)(_K,{className:xD.k9,from:!1,to:{opacity:1},"data-flx":"app.sidebar-nav.guild-folder-item.render-expanded-folder-background.expanded-folder-background"}):null}(),' +
        '(0,o.jsx)(eA.m_,{position:"right",maxWidth:"xl",size:"large",text:()=>(0,o.jsx)("flx-app-guild-folder-item-tooltip",{}),"data-flx":"app.sidebar-nav.guild-folder-item.tooltip"}),' +
        'function(){return y?(0,o.jsx)(_Y,{className:xD.QD,from:!1,to:{opacity:1},"data-flx":"app.sidebar-nav.guild-folder-item.render-expanded-guilds.expanded-guilds"}):null}(),' +
        '"app.sidebar-nav.guild-folder-item.folder-container"]}}',
    );
    const views: unknown[][] = [];
    let view = { expanded: true, folderIcon: true, guilds: false };
    const folderView = spyOn(betterFolders, "folderView").mockImplementation(
      (...values: unknown[]) => (views.push(values), view),
    );
    try {
      const render = runPatched(pendingFor(betterFolders), folderModule);
      const props = { folder: { id: 1 }, guilds: [], registerScrollTarget: null };
      const [open, background, folderIcon, servers] = render(props);
      assert.deepEqual(views, [[props, true]]);
      assert.equal(open, true);
      assert.equal(background.type, "Background");
      assert.equal(folderIcon.type, "Tooltip");
      assert.equal(servers, null);

      view = { expanded: true, folderIcon: false, guilds: true };
      const [, noBackground, noFolderIcon, moved] = render(props);
      assert.equal(noBackground, null);
      assert.equal(noFolderIcon, false);
      assert.equal(moved.type, "Servers");
    } finally {
      folderView.mockRestore();
    }
  });

  it("moves an open folder's servers to the sidebar and keeps its copy there whole", () => {
    const folder = { folder: { id: 1 }, registerScrollTarget: null };
    const view = (props: object, expanded: boolean) =>
      betterFolders.folderView({ ...folder, ...props }, expanded);
    assert.deepEqual(view({}, true), { expanded: true, folderIcon: true, guilds: false });
    assert.deepEqual(view({}, false), { expanded: false, folderIcon: true, guilds: false });
    assert.deepEqual(view({ influxFolderIcon: false }, true), {
      expanded: true,
      folderIcon: false,
      guilds: true,
    });

    store.keepIcons = true;
    assert.deepEqual(view({}, true), { expanded: false, folderIcon: true, guilds: false });
    store.sidebar = false;
    assert.deepEqual(view({}, true), { expanded: true, folderIcon: true, guilds: true });
  });

  it("leaves folders as they are in Fluxer's layout for narrow windows", () => {
    const findMobileLayout = Stores.MobileLayout;
    Stores.MobileLayout = () => ({ enabled: true });
    try {
      assert.deepEqual(
        betterFolders.folderView({ folder: { id: 1 }, registerScrollTarget: null }, true),
        { expanded: true, folderIcon: true, guilds: true },
      );
    } finally {
      Stores.MobileLayout = findMobileLayout;
    }
  });

  it("watches Fluxer's store of open folders and still hands it on to be saved", () => {
    // Shape of Fluxer's GuildFolderExpanded store, which saves its open folders.
    const storeModule = compile(
      "function(e,t,n){const uu={iv:(store,key,properties)=>({store,key,properties})};" +
        'e.exports=new class{constructor(){this.expandedFolderIds=[];this.saved=this.initPersistence()}initPersistence(){return(0,uu.iv)(this,"GuildFolderExpanded",["expandedFolderIds"])}}}',
    );
    const watched: unknown[] = [];
    const watch = spyOn(betterFolders, "watch").mockImplementation(
      (folders) => (watched.push(folders), folders),
    );
    try {
      const folders = runPatched(pendingFor(betterFolders), storeModule);
      assert.deepEqual(watched, [folders]);
      assert.deepEqual(folders.saved, {
        store: folders,
        key: "GuildFolderExpanded",
        properties: ["expandedFolderIds"],
      });
    } finally {
      watch.mockRestore();
    }
  });

  it("closes every folder when the home button is clicked", () => {
    // Shape of Fluxer's home button, trimmed to its click handler.
    const buttonModule = compile(
      `function(e,t,n){const o=${jsx},tD={pX:e=>e},s={B:{ME:"/channels/@me"}},S=0,r=0;` +
        'e.exports=()=>(0,o.jsxs)("button",{type:"button",onClick:()=>{let e=s.B.ME;tD.pX(e)},onContextMenu:S,ref:r,"data-flx":"app.sidebar-nav.fluxer-button.fluxer-button.select",children:[]})}',
    );
    const folders = betterFolders.watch(openFolders(1, 2));
    const button = runPatched(pendingFor(betterFolders), buttonModule)();
    button.props.onClick();
    assert.deepEqual(folders.expandedFolderIds, [1, 2]);
    store.closeAllHomeButton = true;
    button.props.onClick();
    assert.deepEqual(folders.expandedFolderIds, []);
  });

  it("closes the other folders when a folder is opened or closed", () => {
    const folders = betterFolders.watch(openFolders(1, 2, 3));
    onFoldersChange([1, 2, 3], [1, 2]);
    assert.deepEqual(folders.expandedFolderIds, [1, 2, 3], "off by default");

    store.closeOthers = true;
    onFoldersChange([1, 2, 3], [1, 2]);
    assert.deepEqual(folders.expandedFolderIds, [3]);

    const closing = betterFolders.watch(openFolders(1, 2));
    onFoldersChange([1, 2], [1, 2, 3]);
    assert.deepEqual(closing.expandedFolderIds, [], "as Vencord does when one of several closes");
  });

  it("leaves the folders that Fluxer restores when it starts", () => {
    store.closeOthers = true;
    const folders = betterFolders.watch(openFolders(1, 2));
    onFoldersChange([1, 2], []);
    assert.deepEqual(folders.expandedFolderIds, [1, 2]);
  });

  it("opens and closes folders as you move between servers", () => {
    const findGuilds = Stores.Guilds;
    const findUserSettings = Stores.UserSettings;
    const loaded = new Set(["100", "200", "300"]);
    Stores.Guilds = () =>
      ({ getGuild: (id: string) => (loaded.has(id) ? { id } : undefined) }) as any;
    Stores.UserSettings = () => ({
      guildFolders: [
        { id: -1, guildIds: ["100"] },
        { id: 1, guildIds: ["200"] },
        { id: 2, guildIds: ["300"] },
      ],
    });
    try {
      const folders = betterFolders.watch(openFolders(2));
      onNavigate("200");
      assert.deepEqual(folders.expandedFolderIds, [2], "does nothing with every option off");

      store.forceOpen = true;
      onNavigate("200");
      assert.deepEqual(folders.expandedFolderIds, [2, 1], "opens the server's folder");
      onNavigate("100");
      assert.deepEqual(folders.expandedFolderIds, [2, 1], "keeps folders open by default");

      store.closeAllFolders = true;
      onNavigate("999");
      assert.deepEqual(folders.expandedFolderIds, [2, 1], "waits for the server to load");
      onNavigate("100");
      assert.deepEqual(folders.expandedFolderIds, []);

      folders.toggleExpanded(1);
      onNavigate("@favorites");
      assert.deepEqual(folders.expandedFolderIds, [], "a page with no server is not in a folder");

      store.forceOpen = false;
      store.closeServerFolder = true;
      onNavigate("300");
      assert.deepEqual(folders.expandedFolderIds, [], "only closes a folder that was open");
      folders.toggleExpanded(1);
      onNavigate("200");
      assert.deepEqual(folders.expandedFolderIds, []);
      folders.toggleExpanded(1);
      onNavigate("200");
      assert.deepEqual(folders.expandedFolderIds, [1], "only when the server changes");
    } finally {
      Stores.Guilds = findGuilds;
      Stores.UserSettings = findUserSettings;
    }
  });
});
