import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  iconBgColor?: string;
  iconColor?: string;
  trendText?: string;
  trendVariant?: 'success' | 'warning' | 'error' | 'neutral' | 'secondary';
  footerLabel?: string;
  footerValue?: string;
  progressPercentage?: number;
  progressBarColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  iconBgColor = 'bg-surface-container-low',
  iconColor = 'text-primary',
  trendText,
  trendVariant = 'neutral',
  footerLabel,
  footerValue,
  progressPercentage,
  progressBarColor = 'bg-primary',
}) => {
  const trendClasses = {
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-rose-100 text-rose-800',
    neutral: 'bg-surface-container-high text-on-surface-variant',
    secondary: 'bg-secondary-fixed text-on-secondary-fixed',
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl p-3 sm:p-4 shadow-subtle border border-outline-variant/30 flex flex-col justify-between hover:shadow-card transition-all relative overflow-hidden group">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-on-surface-variant truncate">
          {label}
        </span>
        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg ${iconBgColor} flex items-center justify-center shrink-0 ${iconColor}`}>
          <span className="material-symbols-outlined text-[16px] sm:text-[18px]">{icon}</span>
        </div>
      </div>

      <div className="my-2 sm:my-2.5 flex items-baseline justify-between gap-1.5 flex-wrap sm:flex-nowrap">
        <span className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-on-surface tracking-tight">
          {value}
        </span>
        {trendText && (
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap ${trendClasses[trendVariant]}`}
          >
            {trendText}
          </span>
        )}
      </div>

      {(footerLabel || footerValue || progressPercentage !== undefined) && (
        <div className="flex flex-col gap-1.5 mt-1">
          {(footerLabel || footerValue) && (
            <div className="flex justify-between items-center text-[10px] sm:text-xs text-on-surface-variant">
              <span className="truncate pr-1">{footerLabel}</span>
              <span className="font-semibold text-on-surface whitespace-nowrap">{footerValue}</span>
            </div>
          )}
          {progressPercentage !== undefined && (
            <div className="w-full bg-surface-container-low h-1.5 rounded-full overflow-hidden">
              <div
                className={`${progressBarColor} h-full rounded-full transition-all duration-700`}
                style={{ width: `${Math.min(100, Math.max(0, progressPercentage))}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
