import { useAuth } from "@/context/auth-context";
import { ApplicationShell, Button, Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";

/**
 * Money hub: Google is the only way in (owner, 10-18: "no password login at
 * all"). The money-hub service checks the Google account against
 * MONEY_LOGIN_EMAILS and hands back the Wealthfolio session; a visitor who
 * already passed Cloudflare's login page never sees this page (auth-context).
 */
export const GOOGLE_SIGN_IN_URL = "/api/money-hub/auth/google";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { loginError } = useAuth();

  return (
    <ApplicationShell className="fixed inset-0 flex items-center justify-center p-6">
      <div className="w-full max-w-md -translate-y-[5vh]">
        <Card className="w-full border-none bg-transparent shadow-none">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <img
                src="/logo-vantage.png?v=2"
                alt={t("auth:login.logoAlt")}
                className="h-16 w-16 sm:h-20 sm:w-20"
              />
            </div>
            <div className="space-y-2">
              <CardTitle>Lam’sfolio</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button asChild variant="outline" className="h-12 w-full gap-3 rounded-full">
                <a href={GOOGLE_SIGN_IN_URL} data-testid="login-google-button">
                  <GoogleMark />
                  Continue with Google
                </a>
              </Button>
              {loginError ? (
                <p className="text-destructive text-center text-sm" role="alert">
                  {loginError}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </ApplicationShell>
  );
}
