import { prisma } from "@/lib/db";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  let settings = await prisma.labSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.labSettings.create({
      data: { id: "default", companyName: "" },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-dm)] text-2xl font-semibold">
          Setări laborator
        </h1>
        <p className="text-sm text-muted">
          Antet, logo și semnături (Întocmit / Verificat) pentru rapoarte.
        </p>
      </div>
      <div className="card max-w-xl">
        <SettingsForm
          initial={{
            companyName: settings.companyName,
            address: settings.address,
            phone: settings.phone ?? "",
            email: settings.email ?? "",
            accreditation: settings.accreditation ?? "",
            logoDataUrl: settings.logoDataUrl ?? "",
            preparedBy: settings.preparedBy ?? "",
            verifiedBy: settings.verifiedBy ?? "",
          }}
        />
      </div>
    </div>
  );
}
