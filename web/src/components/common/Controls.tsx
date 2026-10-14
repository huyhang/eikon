import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import { Icon, type IconName } from './Icon';
import styles from './Controls.module.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  active?: boolean;
  filled?: boolean;
  variant?: 'plain' | 'glass' | 'tinted';
  size?: number;
}

export function IconButton({
  icon,
  label,
  active,
  filled,
  variant = 'plain',
  size = 20,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(styles.iconButton, styles[variant], active && styles.active, className)}
      {...rest}
    >
      <Icon name={icon} size={size} filled={filled} />
    </button>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
}

export function Button({ icon, variant = 'secondary', className, children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={clsx(styles.button, styles[variant], className)} {...rest}>
      {icon && <Icon name={icon} size={17} />}
      <span>{children}</span>
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={clsx(styles.segment, option.value === value && styles.segmentActive)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={clsx(styles.switch, checked && styles.switchOn)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}
