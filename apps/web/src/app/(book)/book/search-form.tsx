import { Button, Input, Label } from "@/components/ui";

export interface SearchParams {
  arrival?: string;
  departure?: string;
  adults?: string;
  children?: string;
  promo?: string;
  attributes?: string;
  embed?: string;
}

/** A plain GET form: works without JavaScript, deep-linkable (spec 10 §10.3), one tab stop per field. */
export function SearchForm({
  action,
  sp,
  labels,
  attributes,
}: {
  action: string;
  sp: SearchParams;
  labels: Record<string, string>;
  attributes?: string[];
}) {
  return (
    <form action={action} method="get" className="grid gap-3 sm:grid-cols-5" data-testid="search">
      {sp.embed ? <input type="hidden" name="embed" value="1" /> : null}
      <div>
        <Label htmlFor="arrival">{labels.arrival!}</Label>
        <Input id="arrival" name="arrival" type="date" required defaultValue={sp.arrival} />
      </div>
      <div>
        <Label htmlFor="departure">{labels.departure!}</Label>
        <Input id="departure" name="departure" type="date" required defaultValue={sp.departure} />
      </div>
      <div>
        <Label htmlFor="adults">{labels.adults!}</Label>
        <Input
          id="adults"
          name="adults"
          type="number"
          min={1}
          max={12}
          defaultValue={sp.adults ?? "2"}
        />
      </div>
      <div>
        <Label htmlFor="children">{labels.children!}</Label>
        <Input
          id="children"
          name="children"
          type="number"
          min={0}
          max={8}
          defaultValue={sp.children ?? "0"}
        />
      </div>
      <div>
        <Label htmlFor="promo">{labels.promo!}</Label>
        <Input id="promo" name="promo" defaultValue={sp.promo} autoComplete="off" />
      </div>
      {attributes && attributes.length > 0 ? (
        <fieldset className="sm:col-span-4">
          <legend className="text-xs text-slate-600">{labels.attributes}</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {attributes.map((a) => (
              <label key={a} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  name="attributes"
                  value={a}
                  defaultChecked={(sp.attributes ?? "").split(",").includes(a)}
                />
                {a}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex items-end">
        <Button type="submit" className="w-full" data-testid="search-submit">
          {labels.search}
        </Button>
      </div>
    </form>
  );
}
