import { getCurrentUser } from "@/lib/dal";
import { AppNav } from "@/components/AppNav";

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  await getCurrentUser();

  return (
    <div>
      <AppNav />
    </div>
  );
}
