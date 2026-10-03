import { isWeb } from "@/adapters";
import { CONNECT_HIDDEN } from "@/lib/money-hub";
import { NotificationsBell } from "@/features/notifications/notifications-bell";
import { isAppleDevice } from "@/lib/device-utils";
import { useAuth } from "@/context/auth-context";
import { ProfileMenu } from "@/features/profiles/profile-menu";
import { useDashboardSkins } from "@/features/spending/lib/dashboard-skin";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { type NavLink, type NavigationProps, isPathActive } from "./app-navigation";
import { ConnectNavItem } from "./connect-nav-item";
import { resolveNavigationIcon } from "./navigation-icons";

interface AppSidebarProps {
  navigation: NavigationProps;
}

const modKey = isAppleDevice() ? "⌘" : "Ctrl";

// money-hub patch: a compact sidebar like Monarch's (owner, 10-02, with a picture of Monarch: "make the menu
// side bar of money compact like this, not too tall but very readable"). The logo and the app's name, Search,
// Alerts and the collapse button share the top row (a column when collapsed; owner: never a second row);
// Settings sits at the bottom above Logout (owner, 10-02); pages are 36px rows in 15px type.
const ROW =
  "text-foreground [&_svg]:size-[18px]! mb-0.5 h-9 gap-3 rounded-md text-[15px] transition-all duration-300";
// money-hub patch: collapsed, a row is its icon over its name in 10px type, like WheelTradr's rail (owner,
// 10-02: "even in collapsed mode it still shows the name of the menu item"); the rail is 84px for it.
const rowAlign = (collapsed: boolean) =>
  collapsed
    ? "h-auto w-full flex-col justify-center gap-1 px-0.5 py-2 [&_svg]:size-5!"
    : "justify-start px-3";
/** The row's name: beside the icon, or under it in small type when collapsed. */
function RowLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={
        collapsed
          ? "w-full truncate text-center text-[10px] font-medium leading-[11px]"
          : "block truncate"
      }
    >
      {children}
    </span>
  );
}
/** The top row's buttons: 28px squares, full-width rows when the sidebar is narrow. */
const headButton = (collapsed: boolean) =>
  cn(
    "text-muted-foreground hover:text-foreground [&_svg]:size-[18px]! shrink-0 rounded-md p-0 transition-colors has-[>svg]:px-0",
    collapsed ? "mb-0.5 h-9 w-full" : "size-7",
  );

export function AppSidebar({ navigation }: AppSidebarProps) {
  const { t } = useTranslation();
  // Remember expanded/collapsed per profile; first visit still starts collapsed.
  const [collapsed, setCollapsed] = usePersistentState("sidebar-collapsed", true);
  const { logout, requiresAuth } = useAuth();
  const addonMenuItems = navigation?.addonMenuItems ?? navigation?.addons ?? [];
  // money-hub patch: the sidebar wears the theme picked for each mode on Settings, Appearance (Meadow or
  // Bronze Titanium; owner, 10-02). globals.css styles it by these attributes.
  const skins = useDashboardSkins();
  const toggleLabel = collapsed
    ? t("common:layout.expand_sidebar")
    : t("common:layout.collapse_sidebar");

  return (
    <div
      data-mside=""
      data-light-skin={skins.light}
      data-dark-skin={skins.dark}
      className={cn({
        "light:bg-secondary/50 hidden h-full border-r transition-[width] duration-300 ease-in-out md:flex md:flex-shrink-0 md:overflow-hidden": true,
        "pt-3": isWeb,
        "pt-12": !isWeb,
        "md:w-sidebar": !collapsed,
        "md:w-sidebar-collapsed": collapsed,
      })}
      data-tauri-drag-region="true"
    >
      <div className="z-20 w-full rounded-xl md:flex">
        <div className="flex w-full flex-col">
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <div data-tauri-drag-region="true" className="min-h-0 flex-1 overflow-y-auto">
              <nav
                data-tauri-drag-region="true"
                aria-label={t("common:layout.sidebar")}
                className={cn("flex shrink-0 flex-col pb-2", collapsed ? "px-1" : "px-2")}
              >
                <div
                  data-tauri-drag-region="true"
                  className={cn(
                    "draggable flex",
                    collapsed ? "flex-col items-center pb-1" : "items-center gap-0.5 pb-4 pl-1.5",
                  )}
                >
                  <Link
                    to="/"
                    title={t("common:dashboard")}
                    className={cn(
                      "group/logo flex items-center gap-2",
                      collapsed ? "mb-2 shrink-0" : "mr-auto min-w-0 pr-2",
                    )}
                  >
                    <span className="block shrink-0 [perspective:400px]">
                      <img
                        className={cn(
                          "h-8 w-8 rounded-full bg-transparent shadow-md transition-transform duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                          collapsed
                            ? "motion-safe:[transform:rotateY(180deg)] motion-safe:group-hover/logo:[transform:rotateY(360deg)]"
                            : "motion-safe:[transform:rotateY(0deg)] motion-safe:group-hover/logo:[transform:rotateY(180deg)]",
                        )}
                        aria-hidden="true"
                        src="/logo.png"
                      />
                    </span>
                    {/* money-hub patch: the app's own name (owner, 10-02: "bring back the Wealthfolio name next to
                        the logo, but rename it to Lam'sfolio"). */}
                    {!collapsed && (
                      <span data-mside-brand="" className="truncate whitespace-nowrap leading-none">
                        Lam’s<span data-mside-brand-folio="">folio</span>
                      </span>
                    )}
                  </Link>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      // Trigger the launcher by dispatching Cmd/Ctrl+K
                      const event = new KeyboardEvent("keydown", {
                        key: "k",
                        code: "KeyK",
                        keyCode: 75,
                        which: 75,
                        metaKey: true,
                        ctrlKey: true,
                        bubbles: true,
                        cancelable: true,
                      });
                      document.dispatchEvent(event);
                    }}
                    data-mside-icon=""
                    className={headButton(collapsed)}
                    title={t("common:layout.search_shortcut", { shortcut: `${modKey}+K` })}
                    aria-label={t("common:layout.search")}
                  >
                    <Icons.Search2 />
                  </Button>

                  {/* money-hub patch: the bell, every alert sent (features/notifications). */}
                  <NotificationsBell variant="sidebar" className={headButton(collapsed)} />

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setCollapsed(!collapsed)}
                    data-mside-icon=""
                    className={headButton(collapsed)}
                    title={toggleLabel}
                    aria-label={toggleLabel}
                  >
                    <Icons.PanelLeftOpen
                      className={cn(
                        "transition-transform duration-500 ease-in-out",
                        !collapsed && "rotate-180",
                      )}
                    />
                  </Button>
                </div>

                {collapsed && <div className="bg-border mx-3 mb-2 h-px" aria-hidden="true" />}

                {navigation?.primary?.map((item) => (
                  <NavItem key={item.title} item={item} collapsed={collapsed} />
                ))}

                {navigation?.pinnedAddons?.map((item) => (
                  <PinnedAddonNavItem
                    key={item.id ?? item.href}
                    item={item}
                    collapsed={collapsed}
                    onSetPinned={navigation.setAddonPinned}
                  />
                ))}

                {addonMenuItems.length > 0 && (
                  <AddonsMenu
                    addons={addonMenuItems}
                    collapsed={collapsed}
                    onSetPinned={navigation.setAddonPinned}
                  />
                )}
              </nav>
            </div>

            <div className={cn("flex shrink-0 flex-col py-2", collapsed ? "px-1" : "px-2")}>
              {navigation?.secondary?.map((item) => (
                <NavItem key={item.title} item={item} collapsed={collapsed} />
              ))}
              {!CONNECT_HIDDEN && <ConnectNavItem collapsed={collapsed} />}
              {isWeb && requiresAuth && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={logout}
                  data-mside-row=""
                  className={cn(ROW, rowAlign(collapsed))}
                  title={t("common:layout.logout")}
                >
                  <span aria-hidden="true">
                    <Icons.LogOut />
                  </span>
                  <RowLabel collapsed={collapsed}>{t("common:layout.logout")}</RowLabel>
                </Button>
              )}
              <div className={cn("flex pt-1", collapsed && "justify-center")}>
                <ProfileMenu collapsed={collapsed} className={collapsed ? undefined : "h-10"} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PinnedAddonNavItemProps {
  item: NavLink;
  collapsed: boolean;
  onSetPinned?: (item: NavLink, pinned: boolean) => void;
}

function PinnedAddonNavItem({ item, collapsed, onSetPinned }: PinnedAddonNavItemProps) {
  const { t } = useTranslation();
  if (collapsed || !onSetPinned) {
    return <NavItem item={item} collapsed={collapsed} />;
  }

  return (
    <div className="group relative">
      <NavItem item={item} collapsed={collapsed} className="w-full pr-10" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hover:bg-accent pointer-events-none absolute right-1 top-1/2 z-10 h-7 w-7 -translate-y-1/2 rounded-full opacity-0 transition-opacity focus:pointer-events-auto focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
            title={t("common:layout.addon_options", { name: item.title })}
            aria-label={t("common:layout.addon_options", { name: item.title })}
          >
            <Icons.MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" className="w-48">
          <DropdownMenuItem onClick={() => onSetPinned(item, false)}>
            <Icons.PinOff className="mr-2 h-4 w-4" />
            {t("common:layout.unpin_from_sidebar")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface NavItemProps {
  item: NavLink;
  collapsed: boolean;
  className?: string;
  onClick?: () => void;
}

function NavItem({ item, collapsed, className, ...props }: NavItemProps) {
  const location = useLocation();
  const isActive = isPathActive(location.pathname, item.href);

  return (
    <Button
      key={item.title}
      variant={isActive ? "secondary" : "ghost"}
      asChild
      data-mside-row=""
      className={cn(ROW, rowAlign(collapsed), className)}
    >
      <Link
        key={item.title}
        to={item.href}
        title={item.title}
        aria-current={isActive ? "page" : undefined}
        {...props}
      >
        <span aria-hidden="true">{resolveNavigationIcon(item.icon, "size-[18px]")}</span>

        <RowLabel collapsed={collapsed}>{item.title}</RowLabel>
      </Link>
    </Button>
  );
}

interface AddonsMenuProps {
  addons: NavLink[];
  collapsed: boolean;
  onSetPinned?: (item: NavLink, pinned: boolean) => void;
}

function AddonsMenu({ addons, collapsed, onSetPinned }: AddonsMenuProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const hasActiveAddon = addons.some((addon) => isPathActive(location.pathname, addon.href));

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={hasActiveAddon ? "secondary" : "ghost"}
          data-active={hasActiveAddon ? "" : undefined}
          data-mside-row=""
          className={cn(ROW, rowAlign(collapsed))}
        >
          <span aria-hidden="true">
            <Icons.Addons />
          </span>
          <RowLabel collapsed={collapsed}>{t("common:addons")}</RowLabel>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "bottom"}
        align="start"
        className="w-max min-w-56 max-w-[calc(100vw-2rem)]"
      >
        {addons.map((addon) => {
          const isActive = isPathActive(location.pathname, addon.href);
          const pinAddon = () => {
            onSetPinned?.(addon, true);
            setOpen(false);
          };

          return (
            <div
              key={addon.id ?? addon.href}
              className={cn(
                "hover:bg-accent focus-within:bg-accent group flex h-10 items-center rounded-sm transition-colors",
                isActive && "bg-secondary",
              )}
            >
              <DropdownMenuItem
                asChild
                className="h-10 min-w-0 flex-1 gap-3 px-3 py-2 text-sm font-medium"
              >
                <Link to={addon.href} onClick={() => setOpen(false)}>
                  <span
                    aria-hidden="true"
                    className="flex size-5 shrink-0 items-center justify-center"
                  >
                    {resolveNavigationIcon(addon.icon, "h-5 w-5")}
                  </span>
                  <span className="whitespace-nowrap">{addon.title}</span>
                </Link>
              </DropdownMenuItem>
              {onSetPinned && (
                <button
                  type="button"
                  className="hover:bg-background focus:bg-background group-hover:bg-background hover:ring-border focus:ring-border group-hover:ring-border mr-1 flex size-8 shrink-0 items-center justify-center rounded-full opacity-0 outline-none transition-[background-color,box-shadow,opacity] hover:ring-1 focus:opacity-100 focus:ring-1 group-hover:opacity-100 group-hover:ring-1"
                  title={t("common:layout.pin_to_sidebar")}
                  aria-label={t("common:layout.pin_addon_to_sidebar", { name: addon.title })}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    pinAddon();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    pinAddon();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    pinAddon();
                  }}
                >
                  <Icons.Pin className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
