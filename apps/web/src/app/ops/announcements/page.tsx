import { getTranslations } from "next-intl/server";
import { Button, Card, Field, Label, PageTitle, Select } from "@/components/ui";
import { withOperator } from "@/server/operator";
import { guard } from "@/server/guard";
import { announceAction, endAnnouncementAction } from "../ops.actions";

const loadAnnouncements = withOperator("announcements.read", { audit: false }, async (ctx) =>
  ctx.repo.announcements(),
);

/** Announcements (spec 12 §12.1): maintenance and incident banners, targetable by tenant. */
export default async function AnnouncementsPage() {
  const t = await getTranslations("ops");
  const rows = await guard(() => loadAnnouncements());
  return (
    <div className="space-y-4">
      <PageTitle>{t("announcements")}</PageTitle>
      <Card>
        <ul className="space-y-1 text-sm" data-testid="announcements">
          {rows.map((a) => (
            <li key={a.id} data-testid="announcement-row" data-level={a.level}>
              <strong>{a.title}</strong> · {a.level} · {a.orgId ? a.orgId.slice(0, 8) : "all"} ·{" "}
              {a.startsAt.slice(0, 16)} → {a.endsAt?.slice(0, 16) ?? "open"}
              {!a.endsAt ? (
                <form action={endAnnouncementAction} className="inline">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="ms-2 text-xs underline" type="submit">
                    {t("end")}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <form action={announceAction} className="grid gap-2 sm:grid-cols-2">
          <Field label={t("announceTitle")} name="title" />
          <div>
            <Label htmlFor="level">{t("level")}</Label>
            <Select id="level" name="level" defaultValue="info">
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="incident">incident</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="body">{t("announceBody")}</Label>
            <textarea
              id="body"
              name="body"
              rows={2}
              className="w-full rounded border border-line-strong p-2 text-sm"
              required
            />
          </div>
          <Field label={t("tenant")} name="orgId" required={false} />
          <Field label={t("endsAt")} name="endsAt" type="datetime-local" required={false} />
          <div>
            <Button type="submit" data-testid="post-announcement">
              {t("post")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
