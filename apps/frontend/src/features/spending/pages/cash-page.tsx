// money-hub patch: the Cash page (owner, 10-04: "cash & cards, and cash forecast deserve their own page").
// The two cards that used to sit on top of the Spending tab, with room: nothing folds, every payment
// ahead shows. The Spending tab keeps one Free cash line that opens this page (free-cash-strip.tsx).
import { useNavigate } from "react-router-dom";

import { useSettingsContext } from "@/lib/settings-provider";
import { Page, PageContent, PageHeader } from "@wealthfolio/ui";

import { CashCardsCard } from "../components/cash-cards-card";
import { CashForecastCard } from "../components/cash-forecast-card";
import { useDashboardSkins } from "../lib/dashboard-skin";

export default function CashPage() {
  const skins = useDashboardSkins();
  const navigate = useNavigate();
  const { settings } = useSettingsContext();
  const currency = settings?.baseCurrency ?? "USD";

  return (
    <div className="meadow min-h-screen" data-light-skin={skins.light} data-dark-skin={skins.dark}>
      <Page>
        <PageHeader heading="Cash" />
        <PageContent className="px-3 pb-[var(--mobile-nav-total-offset)] md:px-6 md:pb-8 lg:px-8">
          <div className="flex flex-col gap-3.5 max-md:gap-2">
            {/* The bills themselves are listed once, on the Subscriptions & Bills page. */}
            <CashCardsCard
              currency={currency}
              expanded
              onShowBills={() => navigate("/spending/subscriptions")}
            />
            <CashForecastCard currency={currency} expanded />
          </div>
        </PageContent>
      </Page>
    </div>
  );
}
