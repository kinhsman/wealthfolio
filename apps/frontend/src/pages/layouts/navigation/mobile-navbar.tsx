import { LiquidGlass } from "@/components/liquid-glass";
import { CONNECT_HIDDEN } from "@/lib/money-hub";
import { NotificationsBell } from "@/features/notifications/notifications-bell";
import { ProfileAvatar } from "@/features/profiles/profile-avatar";
import { useProfile } from "@/features/profiles/profile-context";
import { MobileProfileMenu } from "@/features/profiles/mobile-profile-menu";
import { SyncStatusIcon } from "@/features/wealthfolio-connect/components/sync-status-icon";
import { useAggregatedSyncStatus } from "@/features/wealthfolio-connect/hooks";
import { useHapticFeedback } from "@/hooks/use-haptic-feedback";
import { cn } from "@/lib/utils";
import { useDashboardSkins } from "@/features/spending/lib/dashboard-skin";
import { Icons, Sheet, SheetContent, SheetTitle } from "@wealthfolio/ui";
import { motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { type NavLink, type NavigationProps, isPathActive } from "./app-navigation";
import { resolveNavigationIcon } from "./navigation-icons";
import { CurrencyPills } from "@/components/currency-switch";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";

interface MobileNavBarProps {
  navigation: NavigationProps;
}

// money-hub patch: the bar's buttons slide when the current page's button widens for its name, on the
// same spring as the current-page pill so they move together.
const MotionLink = motion.create(Link);
const SLIDE = { type: "spring", stiffness: 400, damping: 30 } as const;

// money-hub patch: on the phone, Transactions sits in the bar where Insights was and Insights takes
// Transactions' place in the More sheet (owner, 10-03); the computer's sidebar keeps the stock order.
function phoneOrder(items: NavLink[]): NavLink[] {
  const ordered = [...items];
  const insights = ordered.findIndex((item) => item.href === "/insights");
  const transactions = ordered.findIndex((item) => item.href === "/activities");
  if (insights >= 0 && transactions >= 0) {
    [ordered[insights], ordered[transactions]] = [ordered[transactions], ordered[insights]];
  }
  return ordered;
}

export function MobileNavBar({ navigation }: MobileNavBarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isBalanceHidden, toggleBalanceVisibility } = useBalancePrivacy();
  const [profileView, setProfileView] = useState(false);
  const [isLandscape, setIsLandscape] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(orientation: landscape)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape)");
    const onOrientationChange = () => setIsLandscape(query.matches);
    onOrientationChange();
    query.addEventListener("change", onOrientationChange);
    return () => query.removeEventListener("change", onOrientationChange);
  }, []);

  const profileContext = useProfile();
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const showProfileView = (show: boolean) => {
    setProfileView(show);
    requestAnimationFrame(() => {
      (show ? backButtonRef : profileButtonRef).current?.focus();
    });
  };
  const closeMenu = () => setMobileMenuOpen(false);
  const { triggerHaptic } = useHapticFeedback();
  const uniqueId = useId();
  // money-hub patch: the bar wears the theme picked for each mode (owner, 10-02); see globals.css [data-mbar].
  const skins = useDashboardSkins();
  const { status: syncStatus } = useAggregatedSyncStatus();

  const containerClassName = "pointer-events-none fixed inset-x-0 bottom-0 z-50";
  const buttonClassName =
    "text-foreground relative z-10 flex h-14 w-full items-center justify-center rounded-full transition-colors landscape:size-11";
  // money-hub patch: the current page's button shows its name under the icon (owner, 10-03), so its
  // column grows to fit the name (see gridTemplateColumns below).
  const activeButtonClassName =
    "text-foreground relative z-10 flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-full px-2.5 transition-colors landscape:h-11";

  const handleNavigation = useCallback(
    (href: string, isActive: boolean) => {
      if (isActive) return;
      triggerHaptic();
      navigate(href);
    },
    [triggerHaptic, navigate],
  );

  const renderIcon = useCallback((icon?: ReactNode) => resolveNavigationIcon(icon, "size-6"), []);

  const primaryItems = phoneOrder(navigation?.primary ?? []);
  const secondaryItems = navigation?.secondary ?? [];
  const pinnedAddonItems = navigation?.pinnedAddons ?? [];
  const addonMenuItems = navigation?.addonMenuItems ?? navigation?.addons ?? [];
  const directPinnedAddonItems = pinnedAddonItems.slice(0, 1);
  const overflowPinnedAddonItems = pinnedAddonItems.slice(1);

  const searchItem = {
    title: t("common:search"),
    href: "#search",
    icon: <Icons.Search2 className="size-6" />,
  };

  // Landscape has room to keep Holdings directly accessible alongside Dashboard and Insights.
  const visiblePrimaryCount = isLandscape ? 3 : 2;
  const visibleItems = [
    ...primaryItems.slice(0, visiblePrimaryCount),
    ...directPinnedAddonItems,
    searchItem,
  ].filter(Boolean);

  const addonItems = [...overflowPinnedAddonItems, ...addonMenuItems];
  const standardMenuItems: NavLink[] = [
    ...primaryItems.slice(visiblePrimaryCount),
    ...secondaryItems,
    // money-hub patch: Connect hidden (lib/money-hub.ts).
    ...(CONNECT_HIDDEN
      ? []
      : [
          {
            title: t("common:connect"),
            href: "/connect",
            icon: <SyncStatusIcon status={syncStatus} className="size-6" />,
          },
        ]),
  ];
  const moreItems = [...standardMenuItems, ...addonItems];
  const hasMenu = moreItems.length > 0;
  const activeMoreItem = moreItems.find((item) => isPathActive(location.pathname, item.href));

  // Every column shares the room, except the current page's, which is as wide as its name.
  const cellColumn = isLandscape ? "2.75rem" : "minmax(0, 1fr)";
  const gridTemplateColumns = [
    ...visibleItems.map((item) =>
      isPathActive(location.pathname, item.href) ? "auto" : cellColumn,
    ),
    cellColumn,
    ...(hasMenu ? [activeMoreItem ? "auto" : cellColumn] : []),
  ].join(" ");

  const pill = (
    <motion.div
      data-mbar-pill=""
      layoutId={`mobile-nav-indicator-${uniqueId}`}
      className="absolute inset-0 -z-10 rounded-full border border-black/10 bg-black/5 shadow-sm dark:border-white/10 dark:bg-white/10"
      // Set here, not only as a class, so the corners stay round while the pill stretches.
      style={{ borderRadius: 9999 }}
      initial={false}
      transition={SLIDE}
    />
  );
  const pageName = (name: string) => (
    <motion.span
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={SLIDE}
      className="whitespace-nowrap text-[10px] font-medium leading-3"
      aria-hidden="true"
    >
      {name}
    </motion.span>
  );

  return (
    <div
      data-mbar=""
      data-light-skin={skins.light}
      data-dark-skin={skins.dark}
      className={containerClassName}
    >
      {/* Lift off bottom by the design gap while respecting safe area */}
      <div className="flex justify-center px-4 pb-[var(--mobile-nav-bottom-offset)]">
        <LiquidGlass
          variant="floating"
          intensity="subtle"
          className={cn(
            "pointer-events-auto w-full px-1 py-1 landscape:w-fit landscape:py-1.5",
            "h-[var(--mobile-nav-ui-height)]",
          )}
        >
          <nav
            aria-label={t("common:layout.primary_navigation")}
            className="grid auto-cols-fr grid-flow-col place-items-center gap-2 landscape:auto-cols-[2.75rem]"
            style={{ gridTemplateColumns }}
          >
            {visibleItems.map((item) => {
              const isActive = isPathActive(location.pathname, item.href);
              const isSearch = item.href === "#search";

              return (
                <MotionLink
                  layout
                  transition={SLIDE}
                  to={item.href}
                  onClick={(e) => {
                    if (isSearch) {
                      e.preventDefault();
                      triggerHaptic();
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
                    } else {
                      handleNavigation(item.href, isActive);
                    }
                  }}
                  aria-label={item.title}
                  className={isActive ? activeButtonClassName : buttonClassName}
                  key={item.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && pill}
                  <motion.span
                    layout
                    transition={SLIDE}
                    className="relative flex size-7 shrink-0 items-center justify-center outline-none"
                    aria-hidden="true"
                  >
                    {renderIcon(item.icon)}
                  </motion.span>
                  {isActive && pageName(item.title)}
                </MotionLink>
              );
            })}

            {/* money-hub patch: the bell, every alert sent (features/notifications). */}
            <motion.div layout="position" transition={SLIDE} className="w-full">
              <NotificationsBell variant="mobile" className={buttonClassName} />
            </motion.div>

            {hasMenu && (
              <motion.button
                layout
                transition={SLIDE}
                onClick={() => {
                  triggerHaptic();
                  setProfileView(false);
                  setMobileMenuOpen(true);
                }}
                aria-label={t("common:layout.more_options")}
                className={activeMoreItem ? activeButtonClassName : buttonClassName}
              >
                {activeMoreItem && pill}
                <motion.span
                  layout
                  transition={SLIDE}
                  className="relative flex size-7 shrink-0 items-center justify-center outline-none"
                  aria-hidden="true"
                >
                  <Icons.CirclesFour className="size-6" />
                </motion.span>
                {/* The page you are on lives in the More sheet: its name under the More icon. */}
                {activeMoreItem && pageName(activeMoreItem.title)}
              </motion.button>
            )}
          </nav>
        </LiquidGlass>
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          data-mbar=""
          data-mbar-sheet=""
          data-light-skin={skins.light}
          data-dark-skin={skins.dark}
          className="bg-background inset-x-4 bottom-4 flex max-h-[min(82dvh,720px)] flex-col gap-0 overflow-hidden rounded-[2rem] border-0 px-0 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-0 shadow-2xl"
        >
          <div className="bg-muted mx-auto mt-4 h-1.5 w-14 shrink-0 rounded-full" />
          <div className="flex shrink-0 items-center justify-between px-8 pb-4 pt-7">
            <div className="flex min-w-0 items-center gap-3">
              {profileView && (
                <button
                  ref={backButtonRef}
                  type="button"
                  onClick={() => showProfileView(false)}
                  className="hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-full"
                  aria-label={t("common:back")}
                >
                  <Icons.ArrowLeft className="size-5" />
                </button>
              )}
              <SheetTitle
                className={cn("truncate font-semibold", profileView ? "text-lg" : "text-2xl")}
              >
                {profileView ? t("common:profiles.yourProfile") : t("common:layout.more")}
              </SheetTitle>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="bg-muted text-foreground hover:bg-muted/80 flex size-11 items-center justify-center rounded-full transition-colors"
              aria-label={t("common:layout.close_more_menu")}
            >
              <Icons.Close className="size-5" />
            </button>
          </div>

          <div className="scrollbar-hide min-h-0 overflow-y-auto px-8">
            {profileView ? (
              <MobileProfileMenu onAction={closeMenu} />
            ) : (
              <>
                {profileContext?.profile && (
                  <div className="border-border/70 border-b pb-3">
                    <button
                      ref={profileButtonRef}
                      type="button"
                      onClick={() => showProfileView(true)}
                      aria-label={t("common:profiles.menuLabel", {
                        name: profileContext.profile.name,
                      })}
                      className="hover:bg-muted flex min-h-14 w-full items-center gap-4 rounded-lg text-left"
                    >
                      <ProfileAvatar
                        id={profileContext.profile.avatarId}
                        className="mx-0 size-8 shrink-0 rounded-full"
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {profileContext.profile.name}
                      </span>
                      <Icons.ChevronRight className="text-muted-foreground size-5 shrink-0" />
                    </button>
                  </div>
                )}
                {/* money-hub patch: the sidebar's USD / VND / Original switch (components/currency-switch.tsx). */}
                <div className="border-border/70 flex flex-col gap-2 border-b py-3">
                  <span className="text-lg font-semibold">Currency</span>
                  <CurrencyPills size="sheet" />
                </div>
                {/* money-hub patch: the hide-numbers eye (owner, 10-03: "add the eye to the phone More menu too");
                    the icon is what a press does, as on the Dashboard's old eye. */}
                <button
                  type="button"
                  onClick={toggleBalanceVisibility}
                  className="border-border/70 text-foreground flex h-16 w-full items-center gap-4 border-b text-left"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center">
                    {isBalanceHidden ? <Icons.Eye className="size-6" /> : <Icons.EyeOff className="size-6" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-lg font-semibold">
                    {isBalanceHidden ? t("common:component.show_balance") : t("common:component.hide_balance")}
                  </span>
                </button>
                <div className="divide-border/70 divide-y">
                  {standardMenuItems.map((item) => {
                    const isActive = isPathActive(location.pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => {
                          handleNavigation(item.href, isActive);
                          setMobileMenuOpen(false);
                        }}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "group flex h-16 items-center gap-4 transition-colors",
                          isActive ? "text-primary" : "text-foreground",
                        )}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center">
                          {renderIcon(item.icon)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-lg font-semibold">
                          {item.title}
                        </span>
                        <Icons.ChevronRight className="text-muted-foreground/50 size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    );
                  })}
                </div>

                {addonItems.length > 0 && (
                  <div className="pt-6">
                    <div className="text-muted-foreground pb-3 text-xs font-semibold uppercase tracking-[0.35em]">
                      {t("common:addons")}
                    </div>
                    <div className="divide-border/70 divide-y">
                      {addonItems.map((item) => {
                        const isActive = isPathActive(location.pathname, item.href);

                        return (
                          <Link
                            key={item.href}
                            to={item.href}
                            onClick={() => {
                              handleNavigation(item.href, isActive);
                              setMobileMenuOpen(false);
                            }}
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                              "group flex h-16 items-center gap-4 transition-colors",
                              isActive ? "text-primary" : "text-foreground",
                            )}
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center">
                              {renderIcon(item.icon)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-lg font-semibold">
                              {item.title}
                            </span>
                            <Icons.ChevronRight className="text-muted-foreground/50 size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
