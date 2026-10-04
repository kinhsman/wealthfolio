import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icons,
} from "@wealthfolio/ui";
import { ProfileAvatar } from "./profile-avatar";
import { useProfile } from "./profile-context";

export function ProfileMenu({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const context = useProfile();
  if (!context?.profile) return null;
  const { profile, profileCount, addProfile, manageProfile, lockProfile, switchProfile } = context;
  const singleProfile = profileCount === 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "group h-12 min-w-0 gap-3 !overflow-visible py-0 hover:bg-transparent",
            collapsed
              ? "w-12 shrink-0 rounded-full p-0 has-[>svg]:px-0"
              : "w-full justify-start rounded-lg px-2 has-[>svg]:px-2",
            className,
          )}
          aria-label={t("profiles.menuLabel", { name: profile.name })}
          title={profile.name}
        >
          <span className="profile-lock-avatar profile-sidebar-avatar shrink-0 transition-[filter] group-hover:drop-shadow-[0_0_7px_#c09a5bb3] dark:group-hover:drop-shadow-[0_0_8px_#e2bd75b3]">
            <ProfileAvatar
              id={profile.avatarId}
              className="mx-0 size-6 rounded-full object-contain [&_.profile-abstract-sculpture]:scale-90"
            />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left">{profile.name}</span>
              <Icons.ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      {/* money-hub patch (owner, 10-04: "never anything waste of screen space"): the same compact
          rows as every other menu; this one had 44px rows, a 40px picture and rounder corners. */}
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <ProfileAvatar id={profile.avatarId} className="mx-0 size-6 shrink-0 rounded-full" />
          <span className="min-w-0 truncate">{profile.name}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={manageProfile}>
          <Icons.User className="size-4" />
          {t("profiles.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={singleProfile ? addProfile : switchProfile}>
          {singleProfile ? <Icons.Plus className="size-4" /> : <Icons.Users className="size-4" />}
          {t(singleProfile ? "profiles.add" : "profiles.switch")}
        </DropdownMenuItem>
        {profile.lockEnabled && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={lockProfile}>
              <Icons.Lock className="size-4" />
              {t("profiles.lock")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
