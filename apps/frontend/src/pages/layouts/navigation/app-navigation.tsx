import { getDynamicNavItems, subscribeToNavigationUpdates } from "@/addons/addons-runtime-context";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getAddonNavPinKey, useAddonNavigationPins } from "./addon-navigation-pins";

export interface NavLink {
  id?: string;
  title: string;
  /** money-hub patch: a shorter name for the 84px collapsed rail and the phone bar's page pill, where the
   *  full title does not fit; everywhere else the full title shows. */
  shortTitle?: string;
  href: string;
  icon?: ReactNode;
  keywords?: string[];
  label?: string; // Optional descriptive label for launcher/search
}

export interface NavigationProps {
  primary: NavLink[];
  secondary?: NavLink[];
  addons?: NavLink[];
  addonMenuItems?: NavLink[];
  pinnedAddons?: NavLink[];
  setAddonPinned?: (item: NavLink, pinned: boolean) => void;
}

type TFunction = ReturnType<typeof useTranslation>["t"];

function buildStaticNavigation(t: TFunction): NavigationProps {
  return {
    primary: [
      {
        icon: <Icons.Dashboard className="size-6" />,
        title: t("common:dashboard"),
        href: "/dashboard",
        keywords: ["home", "overview", "summary"],
        label: t("common:nav.label_dashboard"),
      },
      {
        icon: <Icons.Insight className="size-6" />,
        title: t("common:insights"),
        href: "/insights",
        keywords: ["insights", "Analytics"],
        label: t("common:nav.label_insights"),
      },
      {
        icon: <Icons.Holdings className="size-6" />,
        title: t("common:holdings"),
        href: "/holdings",
        keywords: ["Holdings", "portfolio", "assets", "positions", "stocks"],
        label: t("common:nav.label_holdings"),
      },
      {
        // money-hub patch: the owner calls this page Transactions (10-02); plain words, the URL stays.
        icon: <Icons.Activity className="size-6" />,
        title: "Transactions",
        href: "/activities",
        keywords: ["transactions", "activities", "trades", "history"],
        label: "View transactions",
      },
      {
        // money-hub patch: Cash (features/spending/pages/cash-page.tsx), next to Transactions so the phone's
        // bar keeps Dashboard and Transactions (owner, 10-04); plain words, no translation key.
        icon: <Icons.Wallet className="size-6" />,
        title: "Cash",
        href: "/cash",
        keywords: ["cash", "free cash", "forecast", "cards", "balance", "bills", "cushion"],
        label: "Free cash, your cards and the cash forecast",
      },
      {
        // money-hub patch: Subscriptions & Bills (features/spending/pages/spending-subscriptions-page.tsx), the
        // page that was only reachable from "See all" on the Spending tab (owner, 10-04: "the subs and bills
        // page deserve their own page"; "Subscriptions and Bills" is its name). After Cash so the phone's bar
        // keeps Dashboard and Transactions. The 84px rail and the phone pill show "Subs & Bills" (shortTitle).
        icon: <Icons.Calendar className="size-6" />,
        title: "Subscriptions & Bills",
        shortTitle: "Subs & Bills",
        href: "/spending/subscriptions",
        keywords: ["subscriptions", "subs", "bills", "recurring", "repeating", "due", "netflix", "rent", "calendar"],
        label: "Subscriptions and bills: what repeats, what is due and when",
      },
      {
        icon: <Icons.Goals className="size-6" />,
        title: t("common:goals"),
        href: "/goals",
        keywords: ["goals", "fire", "retire", "retirement", "savings", "planner"],
        label: t("common:nav.label_goals"),
      },
      {
        // money-hub patch: Taxes (features/taxes), a page of the owner's own; plain words, no translation key.
        icon: <Icons.Taxes className="size-6" />,
        title: "Taxes",
        href: "/taxes",
        keywords: ["tax", "taxes", "irs", "1099", "w-2", "gift", "forms", "papers"],
        label: "The tax year: what is taxed, paid, due and still to come in",
      },
      {
        icon: <Icons.Sparkles className="size-6" />,
        title: t("common:assistant"),
        href: "/assistant",
        keywords: ["ai", "assistant", "chat", "help", "ask"],
        label: t("common:nav.label_assistant"),
      },
    ],
    secondary: [
      {
        icon: <Icons.Settings className="size-6" />,
        title: t("common:settings"),
        href: "/settings",
        keywords: ["preferences", "config", "configuration"],
      },
    ],
  };
}

export function useNavigation() {
  const { t } = useTranslation();
  const staticNavigation = useMemo(() => buildStaticNavigation(t), [t]);
  const [dynamicItems, setDynamicItems] = useState<NavigationProps["addons"]>([]);
  const { hasConfiguredAddonPins, pinnedAddonIdSet, setAddonPinned, setPinnedAddonIds } =
    useAddonNavigationPins();

  // Subscribe to navigation updates from addons
  useEffect(() => {
    const updateDynamicItems = () => {
      const itemsFromRuntime = getDynamicNavItems();
      setDynamicItems(itemsFromRuntime);
    };

    // Initial load
    updateDynamicItems();

    // Subscribe to updates
    const unsubscribe = subscribeToNavigationUpdates(updateDynamicItems);

    return () => {
      unsubscribe();
    };
  }, []);

  // Spending lives entirely on the dashboard tab (and its deep-linked pages);
  // no top-level nav entry. Combine static navigation items with addons.
  const primary = [...staticNavigation.primary];
  const addons = useMemo(() => dynamicItems ?? [], [dynamicItems]);

  useEffect(() => {
    if (hasConfiguredAddonPins || addons.length !== 1) {
      return;
    }

    const onlyAddonId = getAddonNavPinKey(addons[0]);
    setPinnedAddonIds((currentIds) =>
      currentIds.includes(onlyAddonId) ? currentIds : [...currentIds, onlyAddonId],
    );
  }, [addons, hasConfiguredAddonPins, setPinnedAddonIds]);

  const pinnedAddons = useMemo(
    () => addons.filter((item) => pinnedAddonIdSet.has(getAddonNavPinKey(item))),
    [addons, pinnedAddonIdSet],
  );
  const addonMenuItems = useMemo(
    () => addons.filter((item) => !pinnedAddonIdSet.has(getAddonNavPinKey(item))),
    [addons, pinnedAddonIdSet],
  );
  const navigation: NavigationProps = {
    primary,
    secondary: staticNavigation.secondary,
    addons,
    addonMenuItems,
    pinnedAddons,
    setAddonPinned,
  };

  return navigation;
}

export function isPathActive(pathname: string, href: string): boolean {
  if (!href) {
    return false;
  }

  const ensureLeadingSlash = href.startsWith("/") ? href : `/${href}`;
  const normalize = (value: string) => {
    if (value.length > 1 && value.endsWith("/")) {
      return value.slice(0, -1);
    }
    return value;
  };

  const normalizedHref = normalize(ensureLeadingSlash);
  const normalizedPath = normalize(pathname);

  if (normalizedHref === "/") {
    return normalizedPath === "/";
  }

  // Dashboard and Net Worth are grouped together
  if (normalizedHref === "/dashboard") {
    return (
      normalizedPath === "/" || normalizedPath === "/dashboard" || normalizedPath === "/net-worth"
    );
  }

  return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
}
