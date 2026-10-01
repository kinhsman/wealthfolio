import { ProfileShell } from "@/features/profiles/profile-shell";
import { NativeDatabaseGate } from "@/features/database-recovery/native-database-gate";
import { isWeb } from "@/adapters";
import { AddonRuntimeLoader } from "@/addons/addon-runtime-loader";
import { setAddonQueryClient } from "@/addons/addons-runtime-context";
import { AssetLogoRegistrySync } from "@/components/asset-logo-registry-sync";
import { Toaster } from "@/components/sonner";
import { AuthGate, AuthProvider } from "@/context/auth-context";
import { EventDialogProvider } from "@/features/spending/components/event-dialog-provider";
// money-hub patch: the Make a rule preview, opened from the rule offer toast.
import { RuleOfferHost } from "@/features/spending/components/rule-offer-dialog";
import { CountsAsHost } from "@/features/spending/components/counts-as-dialog";
// money-hub patch: "which subscription or bill is this?", opened when a charge is filed as one.
import { TrackChargeHost } from "@/features/spending/components/track-charge-dialog";
// money-hub patch: a return and the refund it is waiting for, opened from a purchase's menu.
import { TrackReturnHost } from "@/features/spending/components/track-return-dialog";
import { WealthfolioConnectProvider } from "@/features/wealthfolio-connect";
import { SettingsProvider } from "@/lib/settings-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@wealthfolio/ui";
import { useState } from "react";
import { PrivacyProvider } from "./context/privacy-context";
import { LoginPage } from "./pages/auth/login-page";
import { AppRoutes } from "./routes";

function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 5 * 60 * 1000,
            retry: false,
          },
        },
      }),
  );

  const isWebEnv = isWeb;

  setAddonQueryClient(queryClient as unknown as Parameters<typeof setAddonQueryClient>[0]);

  const content = (
    <SettingsProvider>
      <WealthfolioConnectProvider>
        <PrivacyProvider>
          <TooltipProvider>
            <Toaster mobileOffset={{ top: "68px" }} closeButton expand={false} />
            <AddonRuntimeLoader />
            <EventDialogProvider>
              <AssetLogoRegistrySync />
              <RuleOfferHost />
              <CountsAsHost />
              <TrackChargeHost />
              <TrackReturnHost />
              <AppRoutes />
            </EventDialogProvider>
          </TooltipProvider>
        </PrivacyProvider>
      </WealthfolioConnectProvider>
    </SettingsProvider>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {isWebEnv ? (
          <AuthGate fallback={<LoginPage />}>
            <ProfileShell>
              <NativeDatabaseGate>{content}</NativeDatabaseGate>
            </ProfileShell>
          </AuthGate>
        ) : (
          <ProfileShell>
            <NativeDatabaseGate>{content}</NativeDatabaseGate>
          </ProfileShell>
        )}
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
