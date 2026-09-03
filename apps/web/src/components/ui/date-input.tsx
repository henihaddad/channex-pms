"use client";

import { parseDate } from "@internationalized/date";
import { Calendar, DateField, DatePicker, Label } from "@heroui/react";

/**
 * A date field that submits an ISO date (YYYY-MM-DD) under `name`, like the
 * native input it replaces, but with segmented typing and a calendar popover.
 * Values are plain strings so server components can render it.
 */
export function DateInput({
  name,
  label,
  defaultValue,
  min,
  max,
  required,
  disabled,
  className,
  testId,
  "aria-label": ariaLabel,
}: {
  name: string;
  label?: string;
  defaultValue?: string | null;
  min?: string | null;
  max?: string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  testId?: string;
  "aria-label"?: string;
}) {
  const parse = (v?: string | null) => (v ? parseDate(v.slice(0, 10)) : null);
  return (
    <DatePicker
      name={name}
      defaultValue={parse(defaultValue)}
      minValue={parse(min) ?? undefined}
      maxValue={parse(max) ?? undefined}
      isRequired={required}
      isDisabled={disabled}
      granularity="day"
      className={className}
      aria-label={label ? undefined : (ariaLabel ?? name)}
      data-testid={testId ?? `date-${name}`}
    >
      {label ? <Label>{label}</Label> : null}
      <DateField.Group fullWidth>
        <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DatePicker.Popover>
        <Calendar aria-label={label ?? ariaLabel ?? name}>
          <Calendar.Header>
            <Calendar.YearPickerTrigger>
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <Calendar.YearPickerGridBody>
              {({ year }) => <Calendar.YearPickerCell year={year} />}
            </Calendar.YearPickerGridBody>
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
}
