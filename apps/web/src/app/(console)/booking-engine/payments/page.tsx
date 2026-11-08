import { redirect } from "next/navigation";

/** Payment rules moved under Financials, where the design puts them; old links still land. */
export default function PaymentRulesMoved() {
  redirect("/financials/payment-rules");
}
