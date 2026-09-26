import { getCurrentUser } from "@/lib/dal";
import { AppNav } from "@/components/AppNav";
import { ValuesVisibilityProvider } from "@/components/ValuesVisibilityProvider";
import { BillingBanner } from "@/components/BillingBanner";

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  // Checagem "de verdade" (contra o banco) — o proxy.ts só faz a checagem
  // otimista de redirecionar quem não tem cookie; aqui é a garantia real
  // (inclusive de conta 'pending'/'suspended', barrada dentro de
  // verifySession(), chamada por getCurrentUser()).
  const user = await getCurrentUser();

  return (
    <ValuesVisibilityProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <AppNav showBilling={Boolean(user?.billingEnabled)} />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
            {user && (
              <BillingBanner
                billingEnabled={user.billingEnabled}
                status={user.status}
                subscriptionDueDate={user.subscriptionDueDate}
              />
            )}
            {children}
          </div>
        </main>
      </div>
    </ValuesVisibilityProvider>
  );
}
