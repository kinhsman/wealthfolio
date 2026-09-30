import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "../settings-header";
import { ExportForm } from "./exports-form";
import { DriveBackupTab } from "./drive-backup-tab";

const ExportSettingsPage = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading={t("settings:export_full_title")}
        text={t("settings:export_description")}
      />
      <Separator />

      <Tabs defaultValue="drive" className="w-full">
        {/* money-hub: one Backups tab, ours (Google Drive + this device). Wealthfolio's own
            Backups tab is left out: on the web it keeps snapshots it cannot restore. */}
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="drive">{t("settings:export_tab_backup")}</TabsTrigger>
          <TabsTrigger value="export">{t("settings:export_title")}</TabsTrigger>
        </TabsList>

        <TabsContent value="drive" className="mt-6">
          <DriveBackupTab />
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t("settings:export_title")}</h3>
              <p className="text-muted-foreground text-sm">
                {t("settings:export_section_description")}
              </p>
            </div>
            <ExportForm />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExportSettingsPage;
