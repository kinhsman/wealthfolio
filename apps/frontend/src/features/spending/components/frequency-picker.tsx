import { useEffect, useState } from "react";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import {
  parseEvery,
  formatEvery,
  type Every,
  type TimeUnit,
} from "../lib/subscriptions";
import { cn } from "@/lib/utils";

interface FrequencyPickerProps {
  value: Every;
  onChange: (value: Every) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function FrequencyPicker({
  value,
  onChange,
  disabled = false,
  className,
  id,
}: FrequencyPickerProps) {
  const parsed = parseEvery(value);
  const [countStr, setCountStr] = useState<string>(String(parsed.count));
  const [unit, setUnit] = useState<TimeUnit>(parsed.unit);

  useEffect(() => {
    const p = parseEvery(value);
    setCountStr(String(p.count));
    setUnit(p.unit);
  }, [value]);

  const handleCountChange = (valStr: string) => {
    setCountStr(valStr);
    const n = parseInt(valStr, 10);
    if (!isNaN(n) && n > 0 && n <= 365) {
      onChange(formatEvery(n, unit));
    }
  };

  const handleCountBlur = () => {
    let n = parseInt(countStr, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > 365) n = 365;
    setCountStr(String(n));
    onChange(formatEvery(n, unit));
  };

  const handleUnitChange = (newUnit: TimeUnit) => {
    setUnit(newUnit);
    let n = parseInt(countStr, 10);
    if (isNaN(n) || n < 1) n = 1;
    onChange(formatEvery(n, newUnit));
  };

  const currentCount = parseInt(countStr, 10) || 1;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="text-xs text-muted-foreground font-medium shrink-0">Every</span>
      <Input
        id={id}
        type="number"
        min={1}
        max={365}
        step={1}
        inputMode="numeric"
        disabled={disabled}
        value={countStr}
        onChange={(e) => handleCountChange(e.target.value)}
        onBlur={handleCountBlur}
        className="w-16 h-9 px-2 text-center text-sm font-medium"
      />
      <Select
        value={unit}
        onValueChange={(u) => handleUnitChange(u as TimeUnit)}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="week">{currentCount === 1 ? "Week" : "Weeks"}</SelectItem>
          <SelectItem value="month">{currentCount === 1 ? "Month" : "Months"}</SelectItem>
          <SelectItem value="year">{currentCount === 1 ? "Year" : "Years"}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
