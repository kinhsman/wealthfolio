// money-hub patch: Trips, a boarding pass alert opens here (/trips/pass/:bookingId): the picture of the flight's boarding
// pass, as big as the screen, on white so the code scans at the gate (owner, 10-30: "when tapping on it it gimme the
// pic of the boarding pass before departure"). A PDF shows in a frame with a button to open it on its own.
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button, Icons, Page, PageContent, PageHeader, Skeleton } from "@wealthfolio/ui";

import { passUrl, shortDay, timeOf, useBookings, type Booking, type Pass } from "../lib/trips";

const isPdf = (p: Pass) => p.mime === "application/pdf";

function Header({ b }: { b: Booking }) {
  const legs = b.legs.filter((l) => l.start);
  return (
    <div className="flex flex-col gap-0.5 text-[13px] text-[var(--m-ink-2)]">
      {legs.length ? (
        legs.slice(0, 6).map((l) => (
          <span key={`${l.title}-${l.start}`}>
            {l.title}
            {l.sub ? `, ${l.sub}` : ""}, {shortDay((l.start ?? "").slice(0, 10))}
            {timeOf(l.start) ? ` ${timeOf(l.start)}` : ""}
          </span>
        ))
      ) : (
        <span>{b.title}</span>
      )}
      {b.confirmation ? <span>Confirmation {b.confirmation}</span> : null}
    </div>
  );
}

function PassView({ b, pass }: { b: Booking; pass: Pass }) {
  const url = passUrl(b.id, pass.id);
  return (
    <section className="flex flex-col gap-2" aria-label={pass.name}>
      <div className="overflow-hidden rounded-xl border border-[var(--m-line)] bg-white">
        {isPdf(pass) ? (
          <iframe title={pass.name} src={url} className="h-[78dvh] w-full border-0 bg-white" />
        ) : (
          <img src={url} alt={pass.name} className="mx-auto max-h-[82dvh] w-full object-contain" />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" className="h-10 flex-1 rounded-full">
          <a href={url} target="_blank" rel="noreferrer">
            <Icons.ExternalLink className="size-4" aria-hidden />
            Open full size
          </a>
        </Button>
        <Button asChild variant="outline" className="h-10 flex-1 rounded-full">
          <a href={passUrl(b.id, pass.id, true)}>
            <Icons.Download className="size-4" aria-hidden />
            Save
          </a>
        </Button>
      </div>
    </section>
  );
}

export default function TripPassPage() {
  const { bookingId = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useBookings();
  const b = data?.find((x) => x.id === bookingId) ?? null;
  const passes = b?.passes ?? [];

  return (
    <Page>
      <PageHeader
        heading="Boarding pass"
        onBack={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/trips");
        }}
      />
      <PageContent className="mx-auto w-full max-w-xl space-y-4">
        {isLoading ? (
          <Skeleton className="h-[60dvh] w-full rounded-xl" />
        ) : isError ? (
          <p className="text-muted-foreground text-sm">The boarding pass could not be loaded. Check your connection and try again.</p>
        ) : !b ? (
          <p className="text-muted-foreground text-sm">
            That flight is gone. <Link to="/trips" className="underline underline-offset-4">Back to Trips</Link>
          </p>
        ) : (
          <>
            <Header b={b} />
            {passes.length ? (
              passes.map((p) => <PassView key={p.id} b={b} pass={p} />)
            ) : (
              <p className="text-muted-foreground text-sm">
                No boarding pass is kept on this flight yet.{" "}
                <Link to="/trips" className="underline underline-offset-4">Add one on Trips</Link>
              </p>
            )}
          </>
        )}
      </PageContent>
    </Page>
  );
}
