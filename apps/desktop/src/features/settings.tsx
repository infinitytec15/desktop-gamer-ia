import { useState } from "react";
import { Bell, KeyRound, Radio } from "lucide-react";
import { LicensePage } from "./license";
import { CredentialsPage } from "./automation";
import { NotificationSettings } from "./programs";
export function SettingsPage() {
  const [section, setSection] = useState("license");
  return (
    <div className="settings-page">
      <div
        className="filter-tabs"
        role="group"
        aria-label="Seções das configurações"
      >
        {[
          { id: "license", label: "Licença e conta", icon: KeyRound },
          { id: "obs", label: "Conexão com o OBS", icon: Radio },
          { id: "notifications", label: "Notificações", icon: Bell },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={section === id}
            onClick={() => setSection(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div hidden={section !== "license"}>
        <LicensePage />
      </div>
      <div hidden={section !== "obs"}>
        <CredentialsPage />
      </div>
      <div hidden={section !== "notifications"}>
        <NotificationSettings />
      </div>
    </div>
  );
}
