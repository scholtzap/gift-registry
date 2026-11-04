import { Button, EventDateForm, Field, Notice } from '@/components/ui';

export type CircleChoice = {
  name: string;
  shareSlug: string;
  role: 'owner' | 'friend';
};

/**
 * The circle summary: one share action, then the date and the place.
 * Which circle you are in lives in the side menu, not here.
 */
export function CircleRail({
  basePath,
  shareSlug,
  shareUrl,
  occasion,
  birthday,
  eventDate,
  eventDateLabel,
  countdown,
  locationNote,
  notice,
  eventDateDraft,
}: {
  basePath: string;
  shareSlug: string;
  shareUrl: string;
  occasion: string;
  birthday: string | null;
  eventDate: string | null;
  eventDateLabel: string | null;
  countdown: string | null;
  locationNote: string | null;
  notice?: string;
  eventDateDraft?: string | null;
}) {
  const text = `Join this gift circle: ${shareUrl}`;
  const dateNotice = notice?.startsWith('Enter a real date') ? notice : undefined;
  const placeNotice = notice?.startsWith('Keep the place') ? notice : undefined;

  return (
    <>
      <section className="pn-stack" aria-labelledby="share-heading">
        <h2 id="share-heading">One link for your group</h2>
        <p className="pn-small pn-muted">{occasion}</p>
        {birthday !== null && <p className="pn-small">Birthday: {birthday}</p>}
        {eventDate !== null && eventDateLabel !== null && (
          <p className="pn-small">
            <time dateTime={eventDate}>{eventDateLabel}</time>
            {countdown !== null && <> · {countdown}</>}
          </p>
        )}
        <div className="pn-actions">
          <button
            type="button"
            className="pn-button pn-button-primary"
            data-share-url={shareUrl}
            data-share-text={text}
          >
            Share this link
          </button>
        </div>
        <p className="pn-small">
          <a className="pn-link" href={`/c/${encodeURIComponent(shareSlug)}`}>Open the link</a>
        </p>
        <p className="pn-small pn-muted">The link does not expire. The share button uses your phone’s share sheet, or copies the link when that sheet is missing:</p>
        <p className="pn-small"><a className="pn-link" href={shareUrl}>{shareUrl}</a></p>
      </section>

      <hr className="pn-divider" />

      <EventDateForm
        basePath={basePath}
        defaultValue={eventDateDraft ?? eventDate}
        notice={dateNotice}
        submitVariant="secondary"
      />

      <form method="post" action={`${basePath}/location`} className="pn-stack pn-stack-sm">
        <input type="hidden" name="intent" value="set_location" />
        {placeNotice !== undefined && <Notice kind="error">{placeNotice}</Notice>}
        <Field
          label="Where"
          name="location"
          id="circle-location"
          type="text"
          maxLength={200}
          defaultValue={locationNote ?? undefined}
          hint="A maps link, a street address, or “my house”. Everyone in the circle can see it."
        />
        <div className="pn-actions">
          <Button type="submit" variant="secondary">Save the place</Button>
        </div>
      </form>

    </>
  );
}
