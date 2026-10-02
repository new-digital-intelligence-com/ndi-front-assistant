import { redirect } from "next/navigation";

// The staff lobby moved to /admin. Customers reach Aida from the "Aida" tab on the main site, or
// through an invite link to /aida/join.
export default function AidaPage() {
  redirect("/admin");
}
