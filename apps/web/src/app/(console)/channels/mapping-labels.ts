import { getTranslations } from "next-intl/server";
import type { MappingLabels } from "./mapping-editor";

/** The room-matching table's words, read raw on the server for the client editor to fill. */
export async function mappingLabels(): Promise<MappingLabels> {
  const t = await getTranslations("channels.mapping");
  return {
    colOurs: t("colOurs"),
    colTheirs: t("colTheirs"),
    colSuggestion: t("colSuggestion"),
    guests: t.raw("guests") as string,
    derived: t("derived"),
    notMatched: t("notMatched"),
    match: t.raw("match") as string,
    allMatched: t("allMatched"),
  };
}
