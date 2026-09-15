import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/dal";

export default async function RootPage() {
  const session = await getOptionalSession();
  redirect(session ? "/dashboard" : "/login");
}
